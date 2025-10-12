#!/usr/bin/env node

/**
 * E2E Test: Gallery Upload Workflow
 * Tests the complete workflow:
 * 1. Upload image via API
 * 2. Verify it appears in gallery list
 * 3. Verify IIIF URL is accessible
 * 4. Verify thumbnail is generated
 */

const http = require('http');

const PORT = 5001;
const HOST = '127.0.0.1';

// Create a simple test image (1x1 red pixel PNG)
const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

async function httpRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: data ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(data))
      } : {}
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTest() {
  console.log('🧪 Starting Gallery Workflow E2E Test\n');

  try {
    // Step 1: Upload test image
    console.log('1️⃣ Uploading test image...');
    const uploadResponse = await httpRequest('POST', '/api/iiif/upload', {
      file: testImageBase64,
      filename: 'test_workflow.png',
      title: 'Gallery Workflow Test Image',
      description: 'E2E test image for gallery workflow verification'
    });

    if (uploadResponse.status !== 200 || uploadResponse.data.status !== 'ok') {
      throw new Error(`Upload failed: ${JSON.stringify(uploadResponse)}`);
    }

    const imageId = uploadResponse.data.image.id;
    const filename = uploadResponse.data.image.filename;
    const iiifUrl = uploadResponse.data.iiifUrl;

    console.log(`   ✅ Upload successful!`);
    console.log(`      Image ID: ${imageId}`);
    console.log(`      Filename: ${filename}`);
    console.log(`      IIIF URL: ${iiifUrl}\n`);

    // Step 2: Verify image appears in gallery list
    console.log('2️⃣ Checking gallery list...');
    const galleryResponse = await httpRequest('GET', '/api/iiif/images');

    if (galleryResponse.status !== 200 || galleryResponse.data.status !== 'ok') {
      throw new Error(`Gallery fetch failed: ${JSON.stringify(galleryResponse)}`);
    }

    const images = galleryResponse.data.images;
    const uploadedImage = images.find(img => img.id === imageId);

    if (!uploadedImage) {
      throw new Error(`Uploaded image ${imageId} not found in gallery list`);
    }

    console.log(`   ✅ Image found in gallery`);
    console.log(`      Total images: ${images.length}`);
    console.log(`      Title: ${uploadedImage.title}`);
    console.log(`      Dimensions: ${uploadedImage.width} × ${uploadedImage.height}\n`);

    // Step 3: Verify IIIF thumbnail URL
    console.log('3️⃣ Testing IIIF thumbnail URL...');
    const thumbnailPath = `/iiif/${filename}/full/300,/0/default.jpg`;

    const thumbnailTest = await new Promise((resolve, reject) => {
      http.get(`http://${HOST}:${PORT}${thumbnailPath}`, (res) => {
        if (res.statusCode === 200) {
          resolve({ accessible: true, contentType: res.headers['content-type'] });
        } else {
          resolve({ accessible: false, status: res.statusCode });
        }
      }).on('error', reject);
    });

    if (!thumbnailTest.accessible) {
      throw new Error(`IIIF thumbnail not accessible: ${JSON.stringify(thumbnailTest)}`);
    }

    console.log(`   ✅ IIIF thumbnail accessible`);
    console.log(`      Content-Type: ${thumbnailTest.contentType}\n`);

    // Step 4: Verify manifest generation
    console.log('4️⃣ Testing IIIF manifest...');
    const imageIdOnly = filename.replace(/\.[^.]+$/, '');
    const manifestResponse = await httpRequest('GET', `/api/iiif/manifest/${imageIdOnly}`);

    if (manifestResponse.status !== 200 || manifestResponse.data.type !== 'Manifest') {
      throw new Error(`Manifest generation failed: ${JSON.stringify(manifestResponse)}`);
    }

    console.log(`   ✅ IIIF manifest generated`);
    console.log(`      Type: ${manifestResponse.data.type}`);
    console.log(`      Label: ${manifestResponse.data.label.en[0]}\n`);

    // Success summary
    console.log('=' .repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('=' .repeat(60));
    console.log('\n📊 Summary:');
    console.log(`   • Image upload: ✅`);
    console.log(`   • Gallery list: ✅`);
    console.log(`   • IIIF thumbnail: ✅`);
    console.log(`   • IIIF manifest: ✅`);
    console.log(`   • Total images in gallery: ${images.length}`);
    console.log('\n🎉 Gallery workflow fully functional!\n');
    console.log('🌐 Open http://localhost:5001 in your browser');
    console.log('   → Click the Gallery (🖼️) button in the dock');
    console.log('   → Click "+ Upload Image" to test the UI upload');
    console.log('   → Click any image card to view full-size\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  }
}

runTest();
