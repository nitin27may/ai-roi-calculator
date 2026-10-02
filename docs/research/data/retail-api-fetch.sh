#!/bin/bash
# usage: fetch.sh outname "filter"
out=$1; filt=$2
url="https://prices.azure.com/api/retail/prices?currencyCode=USD&\$filter=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$filt")"
python3 - "$url" "$out" <<'PY'
import sys,json,subprocess
url,out=sys.argv[1],sys.argv[2]; items=[]
while url:
    r=subprocess.run(["curl","-sS","--cacert","/root/.ccr/ca-bundle.crt",url],capture_output=True,text=True)
    d=json.loads(r.stdout); items+=d.get("Items",[]); url=d.get("NextPageLink")
json.dump(items,open(out,"w"),indent=1); print(out,len(items))
PY
