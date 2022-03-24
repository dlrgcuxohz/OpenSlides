#!/bin/bash -e

##### CONFIG VARIABLES
OPENSLIDES_INSTALL_DIR=/opt/openslides
OPENSLIDES_ADMIN_PASSWORD="changeme"
OPENSLIDES_DOMAIN="openslides.gliederung.de"
OPENSLIDES_FROM_EMAIL="info@dlrg-jugend.de"
OPENSLIDES_EMAIL_HOST="mail.dlrg.de"
OPENSLIDES_EMAIL_HOST_PASSWORD="secret"
OPENSLIDES_EMAIL_HOST_USER="user"
OPENSLIDES_EMAIL_PORT="587"
OPENSLIDES_EMAIL_USE_SSL=False
OPENSLIDES_EMAIL_USE_TLS=True
OPENSLIDES_ENABLE_ELECTRONIC_VOTING=True
##### CONFIG VARIABLES END

apt -y update

apt -y install ca-certificates curl gnupg lsb-release m4

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" >> /etc/apt/sources.list.d/docker.list

apt -y update

apt install -y docker-ce docker-ce-cli containerd.io

curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

chmod +x /usr/local/bin/docker-compose

git clone --recurse-submodules https://github.com/dlrgcuxohz/OpenSlides.git $OPENSLIDES_INSTALL_DIR

cd $OPENSLIDES_INSTALL_DIR

cd docker

./build.sh all

printf "DJANGO_SECRET_KEY='%s'\n" "$(tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 64)" > secrets/django.env

cp secrets/adminsecret.env.example secrets/adminsecret.env

printf "OPENSLIDES_ADMIN_PASSWORD='%s'\n" "${OPENSLIDES_ADMIN_PASSWORD}" > secrets/adminsecret.env

# set variables in .env
export INSTANCE_DOMAIN=${OPENSLIDES_DOMAIN}
export INSTANCE_URL_SCHEMA=https
export EXTERNAL_HTTP_PORT="80"
export EXTERNAL_HTTPS_PORT="443"
export DEFAULT_FROM_EMAIL="${OPENSLIDES_FROM_EMAIL}"
export ENABLE_ELECTRONIC_VOTING=${OPENSLIDES_ENABLE_ELECTRONIC_VOTING}
export EMAIL_HOST="${OPENSLIDES_EMAIL_HOST}"
export EMAIL_HOST_PASSWORD="${OPENSLIDES_EMAIL_HOST_PASSWORD}"
export EMAIL_HOST_USER="${OPENSLIDES_EMAIL_HOST_USER}"
export EMAIL_PORT="${OPENSLIDES_EMAIL_PORT}"
export EMAIL_USE_SSL=${OPENSLIDES_EMAIL_USE_SSL}
export EMAIL_USE_TLS=${OPENSLIDES_EMAIL_USE_TLS}

m4 docker-compose.yml.m4 > docker-compose.yml

docker-compose up
