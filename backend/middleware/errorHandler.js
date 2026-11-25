/**
 * Middleware de manejo global de errores
 */
function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${err.message}`);
  if (process.env.LOG_LEVEL === 'debug') {
    console.error(err.stack);
  }

  const status = err.status || 500;
  const message = status >= 500 ? 'Error interno del servidor' : err.message || 'No se pudo completar la solicitud';

  res.status(status).json({
    success: false,
    error: {
      status,
      message,
      ...(status < 500 && err.code && { code: err.code }),
      ...(status < 500 && err.details && { details: err.details }),
    },
  });
}

/**
 * Helper para crear errores con código de estado
 */
function createError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { errorHandler, createError };
