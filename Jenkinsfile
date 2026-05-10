pipeline {
    agent any

    tools {
        nodejs "NodeJS"
    }

    environment {
        SONAR_HOME = tool "Sonar"
        SONAR_PROJECT_KEY = "synaplex"
        SONAR_PROJECT_NAME = "Synaplex"
    }

    stages {
        stage("Checkout") {
            steps {
                checkout scm
            }
        }

        stage("Install Dependencies") {
            steps {
                sh "npm ci"
                dir("frontend") {
                    sh "npm ci"
                }
            }
        }

        stage("Build Frontend") {
            steps {
                dir("frontend") {
                    sh "npm run build"
                }
            }
        }

        stage("SonarQube Analysis") {
            steps {
                withSonarQubeEnv("Sonar") {
                    sh """
                        $SONAR_HOME/bin/sonar-scanner \
                          -Dsonar.projectKey=$SONAR_PROJECT_KEY \
                          -Dsonar.projectName=$SONAR_PROJECT_NAME \
                          -Dsonar.sources=. \
                          -Dsonar.exclusions=node_modules/**,frontend/node_modules/**,frontend/dist/**,backend/uploads/**,coverage/**
                    """
                }
            }
        }

        stage("OWASP Dependency Check") {
            steps {
                dependencyCheck additionalArguments: "--scan ./ --exclude ./node_modules --exclude ./frontend/node_modules --exclude ./frontend/dist --exclude ./backend/uploads", odcInstallation: "dc"
                dependencyCheckPublisher pattern: "**/dependency-check-report.xml"
            }
        }

        stage("Sonar Quality Gate") {
            steps {
                timeout(time: 2, unit: "MINUTES") {
                    waitForQualityGate abortPipeline: false
                }
            }
        }

        stage("Trivy File System Scan") {
            steps {
                sh "trivy fs --format table -o trivy-fs-report.txt --skip-dirs node_modules --skip-dirs frontend/node_modules --skip-dirs frontend/dist --skip-dirs backend/uploads ."
            }
        }

        stage("Validate Docker Compose") {
            steps {
                sh """
                    if docker compose version >/dev/null 2>&1; then
                      docker compose config
                    else
                      docker-compose config
                    fi
                """
            }
        }

        stage("Deploy Using Docker Compose") {
            steps {
                sh """
                    if docker compose version >/dev/null 2>&1; then
                      docker compose up -d --build
                    else
                      docker-compose up -d --build
                    fi
                """
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: "trivy-fs-report.txt, **/dependency-check-report.xml", allowEmptyArchive: true
        }
    }
}
