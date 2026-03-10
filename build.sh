#!/bin/bash
# =============================================================
# build.sh — Builda as imagens Docker no servidor
# Execute via SSH no servidor antes de subir a stack no Portainer
#
# Uso: bash build.sh
# =============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Meta Ads Dashboard — Build das Imagens ==="
echo ""

echo "▶ Buildando backend..."
docker build -t metaads-backend:latest ./backend
echo "✓ Backend pronto"
echo ""

echo "▶ Buildando frontend..."
docker build -t metaads-frontend:latest ./frontend
echo "✓ Frontend pronto"
echo ""

echo "✅ Imagens buildadas com sucesso!"
echo ""
echo "Imagens disponíveis:"
docker images | grep metaads
echo ""
echo "Próximo passo: suba a stack pelo Portainer usando o docker-compose.yml"
echo "Não esqueça de configurar as variáveis de ambiente no Portainer."
