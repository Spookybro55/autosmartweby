import subprocess, json, websocket, base64, time, sys
import urllib.request

html_path = r"C:\Users\spook\Nabídka weby\offers\nabidka-web-remeslnici.html"
pdf_path = r"C:\Users\spook\Nabídka weby\offers\Nabídka - web - onepager.pdf"
file_url = "file:///" + html_path.replace("\\", "/").replace(" ", "%20")

# Launch Chrome
chrome = subprocess.Popen([
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "--headless=new", "--disable-gpu",
    "--remote-debugging-port=9222",
    "--no-first-run", "--no-default-browser-check",
    "--remote-allow-origins=*",
    file_url
], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

time.sleep(3)

# Get page targets
resp = urllib.request.urlopen("http://localhost:9222/json")
tabs = json.loads(resp.read())
print("Tabs:", json.dumps(tabs, indent=2))

# Find a page type target
ws_url = None
for tab in tabs:
    if tab.get("type") == "page":
        ws_url = tab["webSocketDebuggerUrl"]
        break

if not ws_url:
    print("No page target found")
    chrome.terminate()
    sys.exit(1)

ws = websocket.create_connection(ws_url)

msg_id = 0
def send_cmd(method, params=None):
    global msg_id
    msg_id += 1
    msg = {"id": msg_id, "method": method}
    if params:
        msg["params"] = params
    ws.send(json.dumps(msg))
    while True:
        result = json.loads(ws.recv())
        if result.get("id") == msg_id:
            return result

# Wait for page to be ready
time.sleep(2)

result = send_cmd("Page.printToPDF", {
    "displayHeaderFooter": False,
    "printBackground": True,
    "preferCSSPageSize": False,
    "scale": 0.78,
    "paperWidth": 8.27,
    "paperHeight": 11.69,
    "marginTop": 0.2,
    "marginBottom": 0.2,
    "marginLeft": 0.3,
    "marginRight": 0.3,
})

if "error" in result:
    print("Error:", result["error"])
    ws.close()
    chrome.terminate()
    sys.exit(1)

pdf_data = base64.b64decode(result["result"]["data"])
with open(pdf_path, "wb") as f:
    f.write(pdf_data)

print(f"PDF saved: {len(pdf_data)} bytes")

ws.close()
chrome.terminate()
