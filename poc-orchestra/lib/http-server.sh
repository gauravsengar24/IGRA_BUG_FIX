#!/usr/bin/env bash
set -eE

pipe=/tmp/http-server.${BASHPID}
log=$(mktemp)
trap "rm -f ${pipe} ${log}" TERM EXIT INT ERR

exec 3>&1

[ -p "${pipe}" ] ||  mkfifo ${pipe}

log='echo >&3'
ok_answer="HTTP/1.0 200 OK\r\n";
not_found_answer="HTTP/1.0 404 Not Found\r\n404\r\n"

cat ${pipe} | \
(\
    read method url version;
    ${log} "method: ${method}"
    ${log} "url: ${url}"
    ${log} "version: ${version}"
    header=read;
    ${log} "header: ${header}"
    while [ ${#header} -gt 2 ]; do
        read header;
        ${log} "header: ${header}"
    done;
    file_name=`echo ${url} | sed 's/[^a-z0-9_.-]//gi'`;
    ${log} "file_name: ${file_name}"
    if [ -z ${file_name} ]; then
        (\
            echo -e ${ok_answer};
            ls | ( while read n; do
                if [ -f "$n" ]; then
                    echo "`ls -gh $n`";
                fi;
            done);
            ${log} 'sent directory content'
        );
    elif [ -f ${file_name} ]; then
        echo -en "${ok_answer}"
        echo -en "Content-Type: `file -ib ${file_name}`\n"
        echo -en "Content-Length: `stat -c%s ${file_name}`";
        echo;
        cat ${file_name};
        ${log} "${file_name} served"
    else
        echo -e "HTTP/1.0 404 Not Found\r\n404\r\n";
        ${log} "'Not found' sent"
    fi
) | \
nc -vlp 8080 > ${pipe}

# simplified:
# while true; do { echo -e 'HTTP/1.1 200 OK\r\n'; cat readme.txt; } | nc -q 1 -l 8080; done
