import * as productService from '../services/productService.js'

export function listProductsHandler(req, res, next) {
  try {
    const products = productService.listProducts()
    res.json(products)
  } catch (err) {
    next(err)
  }
}

export function getProductHandler(req, res, next) {
  try {
    const product = productService.getProduct(Number(req.params.id))
    res.json(product)
  } catch (err) {
    next(err)
  }
}

export function createProductHandler(req, res, next) {
  try {
    const { name, sku, price, stock, category } = req.body
    const product = productService.createProduct({ name, sku, price, stock, category })
    res.status(201).json(product)
  } catch (err) {
    next(err)
  }
}

export function updateProductHandler(req, res, next) {
  try {
    const { name, sku, price, stock, category } = req.body
    const product = productService.updateProduct(Number(req.params.id), { name, sku, price, stock, category })
    res.json(product)
  } catch (err) {
    next(err)
  }
}

export function deleteProductHandler(req, res, next) {
  try {
    productService.deleteProduct(Number(req.params.id))
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

export function adjustStockHandler(req, res, next) {
  try {
    const { delta } = req.body
    const product = productService.adjustStockManually(Number(req.params.id), delta)
    res.json(product)
  } catch (err) {
    next(err)
  }
}
