param([switch]$ValidateOnly, [switch]$RunElevated, [string]$LogToken)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$healthUrl = 'http://127.0.0.1:5000/api/health'

# Tailscale's local API on this machine requires an administrator token.
# Request UAC before starting anything, and relay the hidden helper's log.
if (-not $ValidateOnly) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        if ($RunElevated) { Write-Host 'ERROR: Windows no concedio permisos de administrador.'; exit 1 }
        $token = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $logDirectory = Join-Path $root '.tmp\backend-publico'
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        $elevationLog = Join-Path $logDirectory "inicio-$token.log"
        Write-Host 'Acepta la solicitud de administrador de Windows para iniciar Tailscale.'
        try {
            $arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -RunElevated -LogToken ' + $token
            $elevated = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
            if (Test-Path -LiteralPath $elevationLog) { Get-Content -LiteralPath $elevationLog | ForEach-Object { Write-Host $_ } }
            Write-Host "Log del inicio: $elevationLog"
            exit $elevated.ExitCode
        } catch {
            Write-Host "ERROR: No se concedio la elevacion: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host 'Tambien puedes hacer clic derecho en el BAT y seleccionar Ejecutar como administrador.'
            exit 1
        }
    }
    if ($RunElevated) {
        if ($LogToken -notmatch '^\d{8}-\d{6}-\d{3}$') { Write-Host 'ERROR: Identificador de log invalido.'; exit 1 }
        $logDirectory = Join-Path $root '.tmp\backend-publico'
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        Start-Transcript -LiteralPath (Join-Path $logDirectory "inicio-$LogToken.log") -Force | Out-Null
    }
}

function Test-BackendHealth {
    param([string]$Url)
    try {
        $headers = @{}
        if ($Url -eq $healthUrl) { $headers['X-Forwarded-Proto'] = 'https' }
        $result = Invoke-RestMethod -Uri $Url -Headers $headers -Method Get -TimeoutSec 5
        return $result.success -eq $true -and $result.status -eq 'ok' -and $result.app -eq 'SportmancarERP'
    } catch { return $false }
}

function Test-LocalPort {
    $socket = New-Object System.Net.Sockets.TcpClient
    try { $socket.Connect('127.0.0.1', 5000); return $true }
    catch { return $false }
    finally { $socket.Dispose() }
}

try {
    $node = Get-Command node.exe -ErrorAction Stop
    $tailscale = Get-Command tailscale.exe -ErrorAction Stop
    if (-not (Test-Path -LiteralPath (Join-Path $backend 'server.js'))) { throw 'No se encuentra backend/server.js.' }
    if (-not (Test-Path -LiteralPath (Join-Path $backend 'node_modules\express'))) { throw 'Faltan dependencias. Ejecuta npm install en backend.' }
    if ($ValidateOnly) {
        Write-Host 'Validacion correcta: rutas, Node.js, Tailscale y dependencias disponibles.'
        exit 0
    }

    & $node.Source (Join-Path $backend 'scripts\security-preflight.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'La configuracion de seguridad de produccion no es valida.' }

    Write-Host '[1/3] Comprobando backend en el puerto 5000...'
    if (Test-LocalPort) {
        if (-not (Test-BackendHealth $healthUrl)) {
            throw 'El puerto 5000 esta ocupado, pero no responde como SportmancarERP. No se cerro ningun proceso.'
        }
        Write-Host 'El backend ya esta activo; no se inicia otro proceso.'
    } else {
        $logDirectory = Join-Path $root '.tmp\backend-publico'
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $outputLog = Join-Path $logDirectory "backend-$stamp.log"
        $errorLog = Join-Path $logDirectory "backend-$stamp-error.log"
        $oldPort = $env:SERVER_PORT
        $oldHost = $env:SERVER_HOST
        try {
            $env:SERVER_PORT = '5000'
            $env:SERVER_HOST = '127.0.0.1'
            $process = Start-Process -FilePath $node.Source -ArgumentList 'server.js' -WorkingDirectory $backend -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
        } finally {
            $env:SERVER_PORT = $oldPort
            $env:SERVER_HOST = $oldHost
        }
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 1000
            $process.Refresh()
            if ($process.HasExited) { throw "El backend se detuvo. Revisa $errorLog" }
            if (Test-BackendHealth $healthUrl) { $ready = $true; break }
        }
        if (-not $ready) { throw "El backend no respondio a tiempo. Revisa $outputLog y $errorLog. No vuelvas a iniciarlo sin revisar el puerto." }
        Write-Host "Backend iniciado en segundo plano. PID: $($process.Id)"
        Write-Host "Logs: $logDirectory"
    }

    Write-Host '[2/3] Activando acceso publico HTTPS con Tailscale...'
    $stateText = & $tailscale.Source status --json
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Tailscale. Prueba ejecutar el BAT como administrador.' }
    $state = ($stateText -join "`n") | ConvertFrom-Json
    if ($state.BackendState -ne 'Running') { throw 'Tailscale no esta conectado. Abre Tailscale e inicia sesion.' }

    # Do not replace another application's existing public route.
    $configText = & $tailscale.Source funnel status --json
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Funnel. Ejecuta el BAT como administrador.' }
    $config = ($configText -join "`n") | ConvertFrom-Json
    if ($config.Web) {
        foreach ($site in $config.Web.PSObject.Properties) {
            if ($site.Name -notmatch ':443$') { continue }
            foreach ($route in $site.Value.Handlers.PSObject.Properties) {
                if ($route.Name -eq '/' -and $route.Value.Proxy -notin @('http://127.0.0.1:5000', 'http://localhost:5000')) {
                    throw 'La ruta HTTPS principal ya sirve otro destino. No se modifico su configuracion.'
                }
            }
        }
    }
    & $tailscale.Source funnel --bg --yes http://127.0.0.1:5000
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo activar Funnel. Revisa los permisos o habilita Funnel en Tailscale. El backend permanece iniciado.' }

    $dnsName = [string]$state.Self.DNSName
    if (-not $dnsName) { throw 'Tailscale no devolvio el nombre publico del equipo.' }
    $publicBase = 'https://' + $dnsName.TrimEnd('.')
    Write-Host '[3/3] Verificando respuesta HTTPS publica...'
    if (-not (Test-BackendHealth "$publicBase/api/health")) {
        Write-Warning "El backend local funciona, pero no se pudo verificar $publicBase/api/health. Funnel activo no garantiza que el DNS publico ya responda."
        Write-Host 'Comprueba esa direccion desde el telefono usando datos moviles.'
        exit 2
    }
    Write-Host ''
    Write-Host 'Backend iniciado y acceso HTTPS comprobado desde este equipo.' -ForegroundColor Green
    Write-Host "API publica: $publicBase/api"
    Write-Host "Salud: $publicBase/api/health"
    Write-Host 'No se modificaron Netlify, pagos, matriculas ni configuraciones de acceso.'
    Write-Host 'Puedes cerrar esta ventana; el backend y Funnel siguen en segundo plano.'
    Write-Host 'Para acceso desde fuera, el equipo debe permanecer encendido y conectado.'
    exit 0
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
