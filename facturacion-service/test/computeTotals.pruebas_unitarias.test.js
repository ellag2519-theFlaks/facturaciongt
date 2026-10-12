// UN-01 (plan de pruebas, Fase 2): prueba unitaria pura de computeTotals —
// sin base de datos, sin HTTP, sin red. Aísla el único cálculo de negocio
// no trivial del proyecto (IVA 12% + redondeo a centavos).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTotals } from '../src/models/invoiceModel.js'

test('computeTotals: un solo item', () => {
  const result = computeTotals([{ quantity: 2 }], [{ price: 37.5 }])
  assert.deepEqual(result, { subtotal: 75, tax: 9, total: 84 })
})

test('computeTotals: varios items distintos', () => {
  const items = [{ quantity: 2 }, { quantity: 1 }, { quantity: 3 }]
  const products = [{ price: 10 }, { price: 25 }, { price: 5 }]
  // subtotal = 20 + 25 + 15 = 60; IVA = 7.2; total = 67.2
  const result = computeTotals(items, products)
  assert.deepEqual(result, { subtotal: 60, tax: 7.2, total: 67.2 })
})

test('computeTotals: array vacío da todo en cero', () => {
  const result = computeTotals([], [])
  assert.deepEqual(result, { subtotal: 0, tax: 0, total: 0 })
})

test('computeTotals: redondeo a 2 decimales (caso con fracción de centavo)', () => {
  // precio con 3 decimales fuerza un resultado intermedio no exacto en IVA
  const result = computeTotals([{ quantity: 3 }], [{ price: 10.005 }])
  // subtotal = 30.015 -> redondeado 30.02; tax = 30.015*0.12 = 3.6018 -> 3.6;
  // total = 30.015 + 3.6018 = 33.6168 -> redondeado 33.62 (NO es subtotal+tax
  // ya redondeados: 30.02+3.6=33.62 coincide aquí, pero no es por eso)
  assert.deepEqual(result, { subtotal: 30.02, tax: 3.6, total: 33.62 })
})
