"""Build SEPP-sessions.zip after the Render backend has a working HTTPS URL.

The ZIP contains only a Netlify entry point. The authenticated catalogue and
PostgreSQL-backed admin stay on Render; Netlify redirects visitors there.
"""
import argparse
import re
import zipfile
from pathlib import Path
from urllib.parse import urlparse


def build(backend_url, output=None):
    parsed=urlparse(backend_url.strip())
    if parsed.scheme!='https' or not parsed.hostname or not re.fullmatch(r'[A-Za-z0-9.-]+',parsed.netloc) or parsed.path not in ('','/') or parsed.query or parsed.fragment:
        raise ValueError('Provide the HTTPS root URL of the running Render service, without a path.')
    base=f'https://{parsed.netloc}'
    output=Path(output or Path(__file__).resolve().parent/'SEPP-sessions.zip')
    redirects=f'/  {base}/  302!\n/*  {base}/:splat  302!\n'
    index='<!doctype html><html lang="en"><meta charset="utf-8"><title>SEPP sessions</title><meta http-equiv="refresh" content="0;url='+base+'/"><p><a href="'+base+'/">Open SEPP sessions</a></p></html>\n'
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('_redirects',redirects)
        archive.writestr('_headers','/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n')
        archive.writestr('index.html',index)
    return output


if __name__=='__main__':
    parser=argparse.ArgumentParser(description='Create Netlify ZIP that redirects to the live Render session app.')
    parser.add_argument('backend_url',help='e.g. https://your-service.onrender.com')
    args=parser.parse_args()
    print(build(args.backend_url))
