# CalOS Mobile Access - Test Checklist

## 📱 Complete End-to-End Verification Guide

This checklist helps you verify that the entire CalOS mobile access system is working correctly, from server startup to phone connectivity.

---

## ✅ Phase 1: Server Startup Verification

### 1.1 Start Server with Verification
```bash
node scripts/calos-start-verified.js
```

**Expected Output:**
- ✓ Database connection OK
- ✓ Port 5001 is available
- ✓ Server startup detected
- ✓ Health checks passed
- QR code displayed in terminal

**What to Check:**
- [ ] No red error messages
- [ ] Database connection successful
- [ ] QR code visible in terminal (ASCII art)
- [ ] "CalOS Intelligent Router" banner displayed
- [ ] Mobile Access URL shown (e.g., `http://192.168.1.87:5001`)

### 1.2 Manual Health Check (Optional)
```bash
# In a new terminal:
node scripts/health-check.js --verbose
```

**Expected Results:**
- [ ] ✓ Database Connection
- [ ] ✓ Critical Tables
- [ ] ✓ Icon Emoji Column
- [ ] ✓ HTTP Server
- [ ] ✓ Mobile Access Page
- [ ] ✓ OAuth Upload Page
- [ ] ✓ QR Code API
- [ ] ✓ Network Info API
- [ ] ✓ WebSocket Server

---

## 📱 Phase 2: Mobile Device Testing

### 2.1 Network Connection Check

**On Your Phone:**
- [ ] Connected to same WiFi as computer (e.g., your home WiFi)
- [ ] WiFi enabled (not using cellular data)
- [ ] Airplane mode OFF

**On Your Computer:**
```bash
# Check your local IP matches the QR code:
ifconfig | grep "inet "
# Should show 192.168.1.87 or similar
```

### 2.2 QR Code Scan Test

**Method 1: Native Camera App**
1. [ ] Open phone's camera app
2. [ ] Point camera at QR code in terminal
3. [ ] Wait for notification/banner to appear
4. [ ] Tap the notification
5. [ ] Should open: `http://192.168.1.87:5001/oauth-upload.html`

**Method 2: Manual URL Entry**
1. [ ] Open browser on phone
2. [ ] Type: `http://192.168.1.87:5001/mobile-access.html`
3. [ ] Page should load with purple gradient background

---

## 🎯 Phase 3: Mobile Access Page Testing

### 3.1 Mobile Landing Page (`/mobile-access.html`)

**Visual Checks:**
- [ ] Purple gradient background loads
- [ ] "📱 CalOS Mobile Access" header visible
- [ ] "Quick access to CalOS features" subtitle shown
- [ ] Network status shows "Connected"
- [ ] Local IP address displayed correctly
- [ ] QR code image visible on page
- [ ] "📸 OAuth Upload" button present
- [ ] "📊 System Status" button present

**Interactive Tests:**
- [ ] Tap "OAuth Upload" button → redirects to `/oauth-upload.html`
- [ ] Tap "System Status" button → shows network/system info
- [ ] QR code on page is scannable (try with another device)

### 3.2 Network Status Panel

**What to Check:**
- [ ] Connection status: "Connected" (green)
- [ ] Local IP: matches your computer's IP
- [ ] Hostname: shows computer name
- [ ] Browser info: shows mobile browser name
- [ ] "Copy URL" button works (copies to clipboard)

---

## 📤 Phase 4: OAuth Upload Testing

### 4.1 Navigate to OAuth Upload
- [ ] From mobile landing page, tap "OAuth Upload"
- [ ] OR visit: `http://192.168.1.87:5001/oauth-upload.html`

### 4.2 Upload Interface Check

**Visual Elements:**
- [ ] "OAuth Token Upload" header visible
- [ ] "Drag & drop or click to select" upload area
- [ ] Accepted formats listed: .json, .txt, .yaml, .pem
- [ ] "Recent Uploads" section present
- [ ] Responsive design (fits phone screen)

### 4.3 File Upload Test

**Test 1: Text File**
1. [ ] Create test file on phone (or use existing)
2. [ ] Tap upload area
3. [ ] Select file from phone
4. [ ] File uploads successfully
5. [ ] Success message appears
6. [ ] File appears in "Recent Uploads"

**Test 2: JSON File** (if available)
1. [ ] Select .json file
2. [ ] Upload completes
3. [ ] JSON preview shown (if feature enabled)
4. [ ] File stored correctly

**Test 3: Screenshot Upload**
1. [ ] Take screenshot on phone
2. [ ] Try to upload screenshot
3. [ ] Should accept image files
4. [ ] Preview thumbnail shown

### 4.4 Error Handling
- [ ] Try uploading file > 10MB → shows error
- [ ] Try uploading invalid file type → shows warning
- [ ] Upload without WiFi → shows connection error

---

## 🏥 Phase 5: API Endpoint Testing

### 5.1 Test from Phone Browser

**QR Code API:**
- [ ] Visit: `http://192.168.1.87:5001/api/qr-code?path=/test`
- [ ] Should display QR code image (PNG)

**Network Info API:**
- [ ] Visit: `http://192.168.1.87:5001/api/network-info`
- [ ] Should show JSON with IP, hostname, WiFi status

**Health API:**
- [ ] Visit: `http://192.168.1.87:5001/api/health`
- [ ] Should show JSON: `{"status":"ok", ...}`

**Detailed Health API:**
- [ ] Visit: `http://192.168.1.87:5001/api/health/detailed`
- [ ] Should show full system status JSON

### 5.2 Test from Computer

```bash
# Test all endpoints:
curl http://localhost:5001/api/network-info | jq
curl http://localhost:5001/api/health | jq
curl http://localhost:5001/api/health/detailed | jq
curl http://localhost:5001/api/qr-code?path=/test --output test-qr.png
```

---

## 🎮 Phase 6: Advanced Features Testing

### 6.1 PWA Installation (Optional)

**On Mobile Browser:**
- [ ] Visit `/mobile-access.html`
- [ ] Look for "Add to Home Screen" prompt
- [ ] Install as PWA app
- [ ] Icon appears on home screen
- [ ] Launch app from home screen
- [ ] App opens in standalone mode (no browser UI)

### 6.2 WebSocket Connection

**Test Real-time Updates:**
1. [ ] Open browser console on phone (if available)
2. [ ] Look for WebSocket connection message
3. [ ] OR: Make change on computer
4. [ ] Page should update automatically

### 6.3 Cross-Device Testing

**Multiple Devices:**
- [ ] Scan QR code from phone
- [ ] Scan same QR code from tablet
- [ ] Both devices access successfully
- [ ] No connection conflicts

---

## 🐛 Phase 7: Troubleshooting Checklist

### Problem: QR Code Won't Scan

**Fixes to Try:**
- [ ] Check phone and computer on same WiFi
- [ ] Increase QR code terminal size (zoom in)
- [ ] Try different QR scanner app
- [ ] Manually type URL instead
- [ ] Check firewall isn't blocking port 5001

### Problem: Can't Connect from Phone

**Fixes to Try:**
- [ ] Verify IP address: `ifconfig | grep "inet "`
- [ ] Test from computer browser first: `http://localhost:5001`
- [ ] Check computer firewall settings
- [ ] Restart server with `calos-start-verified`
- [ ] Try different WiFi network

### Problem: Upload Fails

**Fixes to Try:**
- [ ] Check file size < 10MB
- [ ] Verify file format is supported
- [ ] Check server logs for errors
- [ ] Test with simple .txt file first
- [ ] Clear browser cache on phone

### Problem: Health Checks Fail

**Fixes to Try:**
- [ ] Run: `node scripts/health-check.js --verbose`
- [ ] Check database connection
- [ ] Restart PostgreSQL: `brew services restart postgresql@14`
- [ ] Run migrations: `node scripts/auto-migrate.js`
- [ ] Check logs in terminal

---

## ✅ Final Verification Summary

### Quick Verification Checklist
- [ ] Server starts without errors
- [ ] Health checks pass
- [ ] QR code scans from phone
- [ ] Mobile landing page loads
- [ ] OAuth upload page works
- [ ] File upload succeeds
- [ ] All API endpoints respond
- [ ] No database errors in logs

### Sign-Off

**Date Tested:** _____________

**Tested By:** _____________

**Devices Tested:**
- [ ] iPhone (iOS version: _____)
- [ ] Android (version: _____)
- [ ] iPad/Tablet (version: _____)

**Network:** _____________

**Results:**
- [ ] ✅ All tests passed
- [ ] ⚠️ Minor issues (list below)
- [ ] ❌ Major issues (list below)

**Notes:**
```
[Add any issues, quirks, or observations here]
```

---

## 📚 Additional Resources

**Scripts:**
- Health check: `node scripts/health-check.js`
- Verified start: `node scripts/calos-start-verified.js`
- Manual start: `calos-start` (alias)

**Documentation:**
- Database fixes: `DATABASE_FIX_SUMMARY.md`
- Mobile setup: `MOBILE_ACCESS_SETUP.md`
- Main README: `CLAUDE.md`

**Endpoints:**
- Mobile Access: `http://<ip>:5001/mobile-access.html`
- OAuth Upload: `http://<ip>:5001/oauth-upload.html`
- Health API: `http://<ip>:5001/api/health`
- QR Code API: `http://<ip>:5001/api/qr-code`

---

**Happy Testing! 📱✨**
