import * as invoiceService from '../services/invoiceService.js'

export async function createInvoiceHandler(req, res, next) {
  try {
    const { customer_name, customer_nit, items, payment_currency } = req.body
    const invoice = await invoiceService.createInvoice({
      customer_name,
      customer_nit,
      items,
      userId: req.user.id,
      payment_currency
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
