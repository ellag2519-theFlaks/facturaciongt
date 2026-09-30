import { Router } from 'express'
import { verifyTokenMiddleware } from '../middlewares/auth.js'
import { createInvoiceHandler, listInvoicesHandler, getInvoiceHandler } from '../controllers/invoiceController.js'

const invoiceRoutes = Router()

invoiceRoutes.post('/', verifyTokenMiddleware, createInvoiceHandler)
invoiceRoutes.get('/', verifyTokenMiddleware, listInvoicesHandler)
invoiceRoutes.get('/:id', verifyTokenMiddleware, getInvoiceHandler)

export default invoiceRoutes
