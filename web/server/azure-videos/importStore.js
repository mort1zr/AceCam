import { VideoImportError } from '../video-import/errors.js'

const conflict = () => new VideoImportError('conflict')

/** Receipts reserve the match ID in Firestore. An Azure precondition prevents overwrites. */
export function createAzureVideoImportStore({ db, container }) {
  const receipts = db.collection('_azureVideoImports')

  function checkIdentity(receipt, { orgId, actorId, matchId }) {
    if (receipt.orgId !== orgId || receipt.actorId !== actorId || receipt.matchId !== matchId ||
        receipt.videoPath !== `orgs/${orgId}/matches/${matchId}/video.mp4`) throw conflict()
  }

  async function find(identity) {
    const receipt = (await receipts.doc(identity.matchId).get()).data()
    if (!receipt) return null
    checkIdentity(receipt, identity)
    const blob = container.getBlockBlobClient(receipt.videoPath)
    let properties
    try {
      properties = await blob.getProperties()
    } catch (error) {
      if (error.statusCode === 404) return null
      throw error
    }
    if (properties.contentLength !== receipt.bytes || properties.contentType !== 'video/mp4' ||
        properties.metadata?.sha256 !== receipt.sha256 || properties.metadata?.uploadedby !== receipt.actorId) throw conflict()
    return receipt
  }

  async function putIfAbsent({ orgId, actorId, matchId, sourceHash, localPath, bytes, sha256, metadata, signal }) {
    const identity = { orgId, actorId, matchId }
    const videoPath = `orgs/${orgId}/matches/${matchId}/video.mp4`
    if (metadata.extension !== 'mp4' || metadata.contentType !== 'video/mp4') throw new VideoImportError('youtube-format')
    const ref = receipts.doc(matchId)
    signal?.throwIfAborted()
    await db.runTransaction(async transaction => {
      const current = (await transaction.get(ref)).data()
      if (current) {
        checkIdentity(current, identity)
        if (current.sourceHash !== sourceHash || current.sha256 !== sha256 || current.bytes !== bytes) throw conflict()
        return
      }
      if ((await transaction.get(db.collection('matches').doc(matchId))).exists) throw conflict()
      transaction.create(ref, { ...identity, videoPath, sourceHash, sha256, bytes })
    })
    signal?.throwIfAborted()
    const existing = await find(identity)
    if (existing) return existing

    const blob = container.getBlockBlobClient(videoPath)
    try {
      await blob.uploadFile(localPath, {
        abortSignal: signal,
        conditions: { ifNoneMatch: '*' },
        blobHTTPHeaders: { blobContentType: 'video/mp4', blobCacheControl: 'private, no-store' },
        metadata: { uploadedby: actorId, sha256 },
      })
    } catch (error) {
      if (error.statusCode !== 412 && error.code !== 'BlobAlreadyExists') throw error
    }
    signal?.throwIfAborted()
    const persisted = await find(identity)
    if (!persisted) throw new VideoImportError('failed')
    return persisted
  }

  return { find, putIfAbsent }
}
