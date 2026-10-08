import { Router } from 'express'
import { verifyTokenMiddleware } from '../middlewares/auth.js'
import { createInvoiceHandler, listInvoicesHandler, getInvoiceHandler, getExchangeRateHandler } from '../controllers/invoiceController.js'

const invoiceRoutes = Router()

invoiceRoutes.post('/', verifyTokenMiddleware, createInvoiceHandler)
invoiceRoutes.get('/', verifyTokenMiddleware, listInvoicesHandler)
// Must precede '/:id' — otherwise Express would match "exchange-rate" as an id.
invoiceRoutes.get('/exchange-rate', verifyTokenMiddleware, getExchangeRateHandler)
invoiceRoutes.get('/:id', verifyTokenMiddleware, getInvoiceHandler)

export default invoiceRoutes
