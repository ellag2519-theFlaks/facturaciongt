import { Router } from 'express'
import { getToday, getByDate, postConvert } from '../controllers/exchangeRateController.js'

const router = Router()

router.get('/today', getToday)
router.get('/date/:date', getByDate)
router.post('/convert', postConvert)

export default router
