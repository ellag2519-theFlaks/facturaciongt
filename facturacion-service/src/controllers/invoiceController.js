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

export function listInvoicesHandler(req, res, next) {
  try {
    const invoices = invoiceService.listInvoices(req.user)
    res.status(200).json(invoices)
  } catch (err) {
    next(err)
  }
}

export function getInvoiceHandler(req, res, next) {
  try {
    const invoice = invoiceService.getInvoice(Number(req.params.id), req.user)
    res.status(200).json(invoice)
  } catch (err) {
    next(err)
  }
}
