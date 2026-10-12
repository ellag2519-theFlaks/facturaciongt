// Jenkinsfile — FacturaciónGT
//
// Pipeline Windows-compatible. No reemplaza las pruebas existentes (backend
// node:test, E2E pytest-playwright) -- las ejecuta y publica sus resultados
// con el plugin JUnit, para que Jenkins muestre PASÓ/FALLÓ por prueba
// individual, no solo el resultado global del build.
//
// Nota sobre "pruebas unitarias" vs "de integración" (Fase 6, sección 10.3
// del plan de pruebas): la suite de facturacion-service NO está separada en
// archivos/comandos distintos por tipo -- la mayoría son de integración real
// contra SQLite (supertest + la app Express real), con un puñado de pruebas
// unitarias puras (computeTotals.test.js, exchangeClient.test.js con stub
// HTTP). Correrlas como una sola etapa es la representación honesta de cómo
// está organizada hoy la suite, en vez de inventar una separación que no
// existe en el código.
pipeline {
    // customWorkspace apunta directo a la carpeta real del proyecto en vez
    // de que Jenkins clone el repo a su propio workspace -- el proyecto no
    // tiene remoto, y Jenkins rechaza por seguridad los checkouts de git
    // sobre rutas locales del sistema de archivos a menos que se debilite
    // esa protección explícitamente. Operar directamente sobre la carpeta
    // real evita el checkout por completo, sin tocar esa protección.
    agent {
        node {
            label ''
            customWorkspace 'C:/Users/ellag/OneDrive/Escritorio/Universidad/8vo. Semestre/Analisis II/Proyecto de facturación'
        }
    }

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        FACTURACION_DIR = 'facturacion-service'
        EXCHANGE_DIR    = 'exchange-service'
        FRONTEND_DIR    = 'frontend'
        TESTS_DIR       = 'tests'
    }

    stages {
        stage('1. Preparación del entorno') {
            steps {
                bat 'node --version'
                bat 'npm --version'
                bat 'py --version'
                bat 'java -version'
            }
        }

        stage('2. Instalar dependencias') {
            steps {
                dir(env.FACTURACION_DIR) { bat 'npm ci' }
                dir(env.EXCHANGE_DIR)    { bat 'npm ci' }
                dir(env.FRONTEND_DIR)    { bat 'npm ci' }
                dir(env.TESTS_DIR) {
                    bat 'py -m pip install -r requirements.txt'
                    bat 'py -m playwright install chromium'
                }
            }
        }

        stage('3. Backend: pruebas unitarias e integración (node:test)') {
            steps {
                dir(env.FACTURACION_DIR) {
                    bat 'node --env-file=.env.test --test --test-concurrency=1 --test-reporter=junit --test-reporter-destination=backend-junit.xml "test/**/*.test.js"'
                }
            }
        }

        stage('4. Verificar build del frontend') {
            steps {
                dir(env.FRONTEND_DIR) { bat 'npm run build' }
            }
        }

        stage('5. Levantar los 3 servidores para E2E') {
            steps {
                powershell '''
                    $root = (Get-Location).Path
                    Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm start" -WorkingDirectory (Join-Path $root "exchange-service") -WindowStyle Hidden
                    Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm start" -WorkingDirectory (Join-Path $root "facturacion-service") -WindowStyle Hidden
                    Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev" -WorkingDirectory (Join-Path $root "frontend") -WindowStyle Hidden

                    function Wait-Port($port, $maxTries) {
                        for ($i = 0; $i -lt $maxTries; $i++) {
                            $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
                            if ($conn) { return $true }
                            Start-Sleep -Seconds 1
                        }
                        return $false
                    }

                    $okExchange = Wait-Port 3002 30
                    $okBackend  = Wait-Port 3001 30
                    $okFrontend = Wait-Port 5173 30

                    if (-not ($okExchange -and $okBackend -and $okFrontend)) {
                        Write-Error "No todos los servidores arrancaron a tiempo (exchange:$okExchange backend:$okBackend frontend:$okFrontend)"
                        exit 1
                    }
                    Write-Output "Los 3 servidores están arriba."
                '''
            }
        }

        stage('6. E2E: Playwright (Python)') {
            steps {
                dir(env.TESTS_DIR) {
                    // --video=on para dejar evidencia en video de cada prueba
                    // (ver pytest.ini). test_usd_payment.py depende de
                    // internet real (Banco de Guatemala) -- si ese servicio
                    // externo falla, esa prueba puede fallar por una razón
                    // ambiental, no por un defecto del proyecto; el build se
                    // marca inestable pero el resto de resultados se publica
                    // igual (ver bloque post).
                    bat 'py -m pytest --video=on --junitxml=reports/e2e-junit.xml --html=reports/report.html -v'
                }
            }
        }

        stage('7. Generar evidencia PPTX') {
            steps {
                dir(env.TESTS_DIR) { bat 'py generate_report.py' }
            }
        }
    }

    post {
        always {
            // Apagar los 3 servidores sin importar cómo terminó el pipeline
            // -- por puerto, no por PID capturado al arrancar, porque
            // npm/cmd/node anidan procesos y el PID de Start-Process no
            // siempre es el que termina ocupando el puerto.
            powershell '''
                foreach ($port in 3001,3002,5173) {
                    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
                    foreach ($c in $conns) {
                        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
                    }
                }
            '''

            junit allowEmptyResults: true, testResults: 'facturacion-service/backend-junit.xml,tests/reports/e2e-junit.xml'

            archiveArtifacts artifacts: 'tests/reports/**, tests/evidence/**, tests/videos/**', allowEmptyArchive: true
        }
    }
}
