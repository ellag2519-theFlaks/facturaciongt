import { Router } from 'express'
import { verifyTokenMiddleware } from '../middlewares/auth.js'
import { requireRole } from '../middlewares/authorize.js'
import {
  listProductsHandler,
  getProductHandler,
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
  adjustStockHandler
} from '../controllers/productController.js'

const productRoutes = Router()

productRoutes.get('/', verifyTokenMiddleware, listProductsHandler)
productRoutes.get('/:id', verifyTokenMiddleware, getProductHandler)
productRoutes.post('/', verifyTokenMiddleware, requireRole('admin'), createProductHandler)
productRoutes.put('/:id', verifyTokenMiddleware, requireRole('admin'), updateProductHandler)
productRoutes.delete('/:id', verifyTokenMiddleware, requireRole('admin'), deleteProductHandler)
productRoutes.patch('/:id/stock', verifyTokenMiddleware, requireRole('admin'), adjustStockHandler)

export default productRoutes
