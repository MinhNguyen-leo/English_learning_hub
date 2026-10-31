import { createTranslationHandler } from '../../server/vercelHandler.ts'
import { admitTranslation } from '../../server/vercelQuota.ts'

export default createTranslationHandler(admitTranslation)
