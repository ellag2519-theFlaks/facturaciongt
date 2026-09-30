import { Router } from 'express'
import { verifyTokenMiddleware } from '../middlewares/auth.js'
import { createInvoiceHandler } from '../controllers/invoiceController.js'

const invoiceRoutes = Router()

invoiceRoutes.post('/', verifyTokenMiddleware, createInvoiceHandler)

export default invoiceRoutes
