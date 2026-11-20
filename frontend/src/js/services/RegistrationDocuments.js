// Independent documents can be uploaded together. Wait for all requests to
// settle before reporting an error so a retry cannot race an unfinished upload.
export async function saveRegistrationDocuments({ saveIdentity, saveCertificate, certificateNeedsIdentity, saveDisability }) {
  const identity = Promise.resolve().then(saveIdentity);
  const certificate = certificateNeedsIdentity
    ? identity.then(saveCertificate)
    : Promise.resolve().then(saveCertificate);
  const tasks = [identity, certificate];
  if (saveDisability) tasks.push(Promise.resolve().then(saveDisability));
  const results = await Promise.allSettled(tasks);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}
