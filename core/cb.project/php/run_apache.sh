#!/bin/bash

WORKSPACE=$1
PORT=$2

# Dir of current script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Detect current platform
# We need this to customize configuration differently for OS X and Linux
platform="$(uname)"

# 2 byte random number in hexadecimal (0xffff)
RAND_ID=$(openssl rand 2 -hex)

# Folder to store our config and other stuff
FOLDER="/tmp/apache-${RAND_ID}"

# Name of conf file
CONF="apache2.conf"

# Platform specific apache extras
EXTRA_CONF=''
if [[ $platform == 'Linux' ]]; then
    EXTRA_CONF="
# Include module configuration:
Include /etc/apache2/mods-enabled/*.load
Include /etc/apache2/mods-enabled/*.conf
"
elif [[ $platform == 'Darwin' ]]; then
    EXTRA_CONF="
# Modules
$(cat /etc/apache2/httpd.conf | grep LoadModule | sed 's/libexec/\/usr\/libexec/g')
LoadModule php5_module /usr/libexec/apache2/libphp5.so
"
fi

# Include phpmyadmin only if there
if [[ -f "/etc/apache2/conf.d/phpmyadmin.conf" ]]; then
  EXTRA_CONF+="
Include /etc/apache2/conf.d/phpmyadmin.conf
"
fi

# Create the necessary folders
mkdir -p ${FOLDER}
mkdir -p "${FOLDER}/logs"

PID_FILE="${FOLDER}/httpd.pid"
LOCK_FILE="${FOLDER}/accept.lock"

# Generate the apache config
cat  <<EOF > "${FOLDER}/${CONF}"
ServerName localhost
Listen ${PORT}
PidFile ${PID_FILE}
LockFile ${LOCK_FILE}

# Start only one server
StartServers 1
MinSpareServers 1
MaxSpareServers 1

# Serve our workspace
DocumentRoot "${WORKSPACE}"
<Directory />
  AllowOverride all
  Order allow,deny
  Allow from all
</Directory>

AddType application/x-httpd-php .php
DirectoryIndex index.html index.php

# Platform specific extra configuration
${EXTRA_CONF}

EOF


# Wait for a process or group of processes
function anywait() {
    for pid in "$@"; do
        while kill -0 "$pid" &> /dev/null; do
            sleep 0.5
        done
    done
}

function cleanup {
    if [[ -f ${PID_FILE} ]]; then
        echo "Killed process"
        # Kill process and all children
        /bin/kill -s KILL -$(cat ${PID_FILE})
    fi
    # Remove folder on exit
    echo "Cleaning up ${FOLDER}"
    rm -rf ${FOLDER}
}

# Cleanup when killed
trap cleanup EXIT INT KILL

# Run apache process in foreground
echo "Running apache2 on ${WORKSPACE} (${FOLDER})"
/usr/sbin/apachectl -d ${FOLDER} -f ${CONF} -e info

# Wait for PID_FILE to appear, timeout after 5s
${DIR}/_waitfile.sh ${PID_FILE} 5

# Wait for Apache process
PID=$(cat ${PID_FILE})
echo "Waiting for Apache2 process : ${PID}"
anywait ${PID}
echo "Apache is dead (pid=${PID})"