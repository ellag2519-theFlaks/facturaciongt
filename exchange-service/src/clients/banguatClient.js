import axios from 'axios'
import { parseStringPromise, processors } from 'xml2js'
import { BANGUAT_SERVICE_URL, REQUEST_TIMEOUT_MS } from '../config/env.js'

const SOAP_NAMESPACE = 'http://www.banguat.gob.gt/variables/ws/'

const XML_PARSER_OPTIONS = {
  explicitArray: false,
  ignoreAttrs: true,
  tagNameProcessors: [processors.stripPrefix],
}

function buildEnvelope(operation, params = '') {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${operation} xmlns="${SOAP_NAMESPACE}">${params}</${operation}>
  </soap:Body>
</soap:Envelope>`
}

async function callBanguat(operation, params) {
  let responseBody
  try {
    const response = await axios.post(BANGUAT_SERVICE_URL, buildEnvelope(operation, params), {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `"${SOAP_NAMESPACE}${operation}"`,
      },
      timeout: REQUEST_TIMEOUT_MS,
    })
    responseBody = response.data
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw Object.assign(new Error(`Banguat request timed out after ${REQUEST_TIMEOUT_MS}ms`), {
        code: 'BANGUAT_TIMEOUT',
      })
    }
    // ASP.NET returns SOAP Faults with an HTTP 5xx status, so axios treats
    // them as errors even though the body still contains a parseable envelope.
    if (!error.response) {
      throw Object.assign(new Error('Banguat service is unreachable'), {
        code: 'BANGUAT_UNREACHABLE',
        cause: error,
      })
    }
    responseBody = error.response.data
  }

  let parsed
  try {
    parsed = await parseStringPromise(responseBody, XML_PARSER_OPTIONS)
  } catch (error) {
    throw Object.assign(new Error('Banguat returned invalid XML'), {
      code: 'BANGUAT_INVALID_XML',
      cause: error,
    })
  }

  const body = parsed?.Envelope?.Body
  if (body?.Fault) {
    throw Object.assign(new Error(body.Fault.faultstring || 'Banguat SOAP fault'), {
      code: 'BANGUAT_SOAP_FAULT',
    })
  }

  return body
}

export async function fetchTodayRate() {
  const body = await callBanguat('TipoCambioDia')
  const varDolar = body?.TipoCambioDiaResponse?.TipoCambioDiaResult?.CambioDolar?.VarDolar

  if (!varDolar) {
    throw Object.assign(new Error('Banguat returned no exchange rate for today'), {
      code: 'BANGUAT_EMPTY_RESPONSE',
    })
  }

  return {
    date: varDolar.fecha,
    rate: Number(varDolar.referencia),
  }
}

export async function fetchRateByDate(dateDDMMYYYY) {
  const params = `<fechainit>${dateDDMMYYYY}</fechainit><fechafin>${dateDDMMYYYY}</fechafin>`
  const body = await callBanguat('TipoCambioRango', params)
  const result = body?.TipoCambioRangoResponse?.TipoCambioRangoResult

  if (!result || Number(result.TotalItems) === 0) {
    return null
  }

  const varItem = result.Vars.Var

  return {
    date: varItem.fecha,
    buy: Number(varItem.compra),
    sell: Number(varItem.venta),
  }
}
