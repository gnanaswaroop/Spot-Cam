/**
 * @file The text of the "How it works" page. It lives in plain data so the React page and the
 * build-time static HTML (what crawlers and link previews see) are always the same words.
 */

export const HOW_IT_WORKS_INTRO =
  'SpotCam is a free camera in your browser. It prints the date, time, GPS coordinates and street address onto every photo, so a photo can show when and where it was taken. There is nothing to install and nothing to sign up for.';

export const HOW_STEPS = [
  { title: 'Open the camera', text: 'Tap Start Cam and allow camera and location access when your browser asks.' },
  { title: 'Take the photo', text: 'SpotCam looks up the address for where you are and stamps it, with the date, time and coordinates, onto the picture.' },
  { title: 'Keep or share it', text: 'Photos are saved on your device. Open the gallery to share a photo, with a map link, or delete it.' },
];

export const USE_CASES = [
  { title: 'Proof of delivery', text: 'Show that a parcel was left at the right door at the right time.' },
  { title: 'Site inspections and field reports', text: 'Record where and when each photo of a site, a repair or a defect was taken.' },
  { title: 'Real estate and insurance', text: 'Keep dated, located photos of a property, a vehicle or damage for a claim.' },
  { title: 'Travel logs', text: 'Remember exactly where a photo was taken, down to the street.' },
];

export const FAQ = [
  {
    question: 'Are my photos uploaded anywhere?',
    answer:
      'No. Photos are made and stored on your own device, in your browser. SpotCam has no accounts and no servers that receive photos. Only your coordinates are sent to a public map service, to look up the street address.',
  },
  {
    question: 'How accurate is the location?',
    answer: 'It is as accurate as your device’s GPS, usually within a few metres outdoors. Indoors or with a weak signal it can be less precise.',
  },
  {
    question: 'Does it work offline?',
    answer:
      'Yes. After your first visit the app opens without a connection and photos are still stamped with the date, time and coordinates. The street address needs a connection.',
  },
  {
    question: 'Which browsers and phones does it work on?',
    answer: 'Current versions of Chrome, Edge, Firefox and Safari on phones and computers, as long as the device has a camera. Location needs your permission.',
  },
  {
    question: 'Can the stamp be edited or faked?',
    answer:
      'The stamp is drawn into the photo’s pixels when you take it. It records what your device reported at that moment, so treat it as a convenient record rather than certified evidence.',
  },
];
