# SpotCam - Documentation

## 1. Introduction

Welcome to SpotCam! This is a modern, web-based camera application designed to run on any mobile device (Android or iOS) directly from the browser. It allows you to capture photos with a real-time overlay of the current date, time, and precise GPS location, including the full street address.

The app is built with privacy and convenience in mind. All captured photos are stored locally on your device's browser storage, giving you full control over your data. You can view your recent captures in a built-in gallery, share them with other apps, or delete them permanently.

---

## 2. Key Features

- **Live Camera Feed**: Access your device's camera directly in the browser.
- **Real-time Data Overlay**: Automatically embeds the current date, time, GPS coordinates (Latitude/Longitude), and the full street address onto the live camera preview and the final captured image.
- **Full Address Display (Reverse Geocoding)**: Automatically converts GPS data into a human-readable address.
- **Instant Capture**: A responsive capture button allows you to snap photos instantly.
- **Local Gallery**: A built-in gallery stores your last 12 photos. The oldest photos are automatically replaced as you take new ones to manage storage.
- **Photo Management**: View, share, and delete individual photos directly from the gallery.
- **Web Share API Integration**: Natively share your photos with other applications on your device, like social media, messaging apps, or cloud storage.
- **Cross-Browser Compatibility**: Built using standard web APIs to ensure it works on modern mobile browsers like Chrome, Safari, and Firefox.
- **Privacy First**: All photos and data are stored exclusively in your browser (IndexedDB). Nothing is uploaded to a server.

---

## 3. User Guide

### 3.1. The Camera View

When you first launch the application, you'll be in the Camera View. You may be prompted by your browser to grant permission to access your camera and location. Please accept these permissions for the app to function correctly.

**Anatomy of the Camera View:**

1.  **Live Preview**: The main area of the screen shows the live feed from your device's rear-facing camera.
2.  **Data Overlay**: At the top-center of the screen, you'll see a semi-transparent overlay displaying:
    - The current date and time, updated every second.
    - Your current GPS coordinates (Latitude and Longitude).
    - Your current address, fetched from your GPS coordinates. It will display "Fetching address..." until the location is resolved. Long addresses will automatically wrap to fit the screen.
3.  **Capture Button**: The large, circular button at the bottom-center is the shutter. Tap it to instantly capture a photo. A subtle flash effect will confirm the capture.
4.  **Gallery Button**: The icon on the bottom-left will take you to the Gallery View where you can see your recently captured photos.

**Screenshot of the Camera View:**

![The main camera interface showing the live preview with the data overlay at the top, and the capture and gallery buttons at the bottom.](placeholder-camera-view.png "Camera View")

### 3.2. The Gallery View

From the Camera View, tap the **Gallery Button** to access your collection of recent photos.

**Anatomy of the Gallery View:**

1.  **Photo Grid**: Your captured photos are displayed in a grid, sorted from newest to oldest.
2.  **Back to Camera Button**: The camera icon in the header allows you to return to the Camera View to take more pictures.
3.  **Empty Gallery Message**: If you haven't taken any photos yet, a message will prompt you to go back and start snapping.

**Screenshot of the Gallery View:**

![The gallery interface showing a grid of recently captured photo thumbnails.](placeholder-gallery-view.png "Gallery View")

### 3.3. Managing a Photo

Tap on any photo thumbnail in the gallery grid to open it in a detailed modal view.

**Anatomy of the Photo Detail View:**

1.  **Full-Size Image**: The selected photo is displayed in a larger format. The embedded date, time, and location data are visible on the image itself.
2.  **Photo Information**: Below the image, you'll find the capture timestamp, GPS coordinates, and the full address where the photo was taken.
3.  **Close Button**: An 'X' button at the top-right corner to close the modal and return to the gallery grid.
4.  **Share Button**: Tapping this button will open your device's native share sheet, allowing you to send the photo to other apps.
5.  **Delete Button**: Tapping this will permanently delete the photo from your local storage.

**Screenshot of the Photo Detail View:**

![The photo detail modal showing a captured image in full view, with Share and Delete action buttons below it.](placeholder-photo-detail-view.png "Photo Detail View")

---

## 4. Technical Details

- **Framework**: The app is built as a Single Page Application using **React**.
- **Camera Access**: It uses the `navigator.mediaDevices.getUserMedia` Web API to access the device's camera stream.
- **Geolocation**: It uses the `navigator.geolocation` API with `watchPosition` to get continuous, high-accuracy location updates. It also uses the free **OpenStreetMap Nominatim API** for reverse geocoding to convert GPS coordinates into a human-readable address.
- **Local Storage (IndexedDB)**: IndexedDB (via `idb-keyval`) is used to persist the captured photos. To keep storage bounded, the gallery is capped at a maximum of 12 photos.
- **Image Processing**: The HTML `<canvas>` element is used to draw the video frame and the data overlay onto a new image when a photo is captured.
- **Sharing**: The native **Web Share API** (`navigator.share`) is used for seamless integration with the device's sharing capabilities.
