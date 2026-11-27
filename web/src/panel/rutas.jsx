import { useCallback, useMemo } from 'react'
import { useAuth } from './context/AuthContext.js'
import { contratarPlan } from './lib/contratarPlan.js'
import { auth, db, storage } from './lib/firebase.js'
import { createAzureYouTubeVideoImporter, createHttpVideoImporter } from './lib/services/httpVideoImportService.js'
import { createAzureVideoClient, createAzureVideoUploadService } from './lib/azureVideos.js'
import { createVideoUploadService, MAX_VIDEO_BYTES } from './lib/videoUpload.js'
import { createPhotoUploadService } from './lib/photoUpload.js'
import { createPlayerPhotoService } from './lib/services/playerPhotoService.js'

// PCIT-225: con VITE_VIDEO_API_URL los videos se guardan en Azure Blob (PCIT-222);
// sin ella, en Firebase Storage (emuladores y desarrollo local).
const videoApiUrl = import.meta.env.VITE_VIDEO_API_URL
const videoApi = videoApiUrl
  ? createAzureVideoClient({ apiUrl: videoApiUrl, getToken: () => auth.currentUser?.getIdToken() })
  : null
const { uploadVideo } = videoApi ? createAzureVideoUploadService({ client: videoApi }) : createVideoUploadService({ storage })
// Las fotos de perfil de los jugadores siempre van a Firebase Storage (no a Azure).
const photoUploadService = createPhotoUploadService({ storage })

function usePropsPanel() {
  const { user, profile } = useAuth()
  const session =
    user && profile ? { uid: user.uid, orgId: profile.orgId, role: profile.role } : undefined
  const importVideo = useMemo(() => {
    if (!user || !profile) return undefined
    const getSession = async () => ({
      orgId: profile.orgId,
      actorId: user.uid,
      token: await user.getIdToken(),
    })
    if (import.meta.env.DEV && import.meta.env.MODE === 'demo') {
      return createHttpVideoImporter({ enabled: true, supportsYouTube: true, endpoint: '/api/video-import', getSession })
    }
    return createAzureYouTubeVideoImporter({
      enabled: import.meta.env.VITE_AZURE_YOUTUBE_IMPORT_ENABLED === 'true', apiUrl: videoApiUrl, getSession,
    })
  }, [user, profile])
  const orgId = profile?.orgId
  const contratar = useCallback(
    ({ plan, periodo }) => contratarPlan({ db, orgId, plan, periodo }),
    [orgId],
  )
  const photoService = useMemo(() => (orgId ? createPlayerPhotoService({ storage, orgId }) : null), [orgId])
  return {
    db,
    storage,
    auth,
    session,
    nombre: profile?.displayName ?? '',
    videoApi,
    uploadVideo,
    importVideo,
    maxBytes: MAX_VIDEO_BYTES,
    contratar,
    photoService,
    photoUploadService,
  }
}

export function conectar(Pagina) {
  return function Ruta() {
    return <Pagina {...usePropsPanel()} />
  }
}
