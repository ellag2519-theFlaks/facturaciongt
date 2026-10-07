import { getTodayRate, getRateByDate, convert } from '../services/exchangeRateService.js'

export async function getToday(req, res, next) {
  try {
    const rate = await getTodayRate()
    res.json(rate)
  } catch (error) {
    next(error)
  }
}

export async function getByDate(req, res, next) {
  try {
    const rate = await getRateByDate(req.params.date)
    res.json(rate)
  } catch (error) {
    next(error)
  }
}

export async function postConvert(req, res, next) {
  try {
    const result = await convert(req.body)
    res.json(result)
  } catch (error) {
    next(error)
  }
}
