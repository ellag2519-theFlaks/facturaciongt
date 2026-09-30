import * as invoiceService from '../services/invoiceService.js'

export function createInvoiceHandler(req, res, next) {
  try {
    const { customer_name, customer_nit, items } = req.body
    const invoice = invoiceService.createInvoice({
      customer_name,
      customer_nit,
      items,
      userId: req.user.id
    })
    res.status(201).json(invoice)
  } catch (err) {
    next(err)
  }
}
