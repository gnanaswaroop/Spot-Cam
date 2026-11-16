/**
 * @file The privacy policy page (/privacy).
 *
 * This text must stay true to what the code does. If you change what data SpotCam collects, stores
 * or sends (new analytics, a different geocoder, uploads...), update it and the "Last updated" date.
 */

import React from 'react';
import { useAnalytics } from '../hooks/useAnalytics';

interface PrivacyViewProps {
  onBack: () => void;
}

export const PRIVACY_LAST_UPDATED = '16 November 2026';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-8">
    <h2 className="text-xl font-semibold text-white">{title}</h2>
    <div className="mt-3 space-y-3 text-gray-300">{children}</div>
  </section>
);

const ExternalLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">
    {children}
  </a>
);

export const PrivacyView: React.FC<PrivacyViewProps> = ({ onBack }) => {
  // The visit-counting section is shown only on a site that has analytics switched on.
  const { available: analyticsOn } = useAnalytics();

  return (
    <div className="app-h w-full overflow-y-auto bg-gray-950 text-gray-200">
      <main className="mx-auto max-w-2xl px-6 pb-16 pt-6 leading-relaxed">
        <a
          href={import.meta.env.BASE_URL}
          onClick={e => {
            e.preventDefault();
            onBack();
          }}
          className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
        >
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-7 w-7 rounded-[22%]" />
          <span>Back to SpotCam</span>
        </a>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-400">Last updated: {PRIVACY_LAST_UPDATED}</p>

        <Section title="The short version">
          <p>
            SpotCam has <strong className="text-white">no accounts, no ads and no servers that receive your photos</strong>.
            Your photos are made and kept <strong className="text-white">on your own device</strong>, in your browser. The one thing
            that leaves your device is your <strong className="text-white">location, sent to a public map service to look up the street
            address</strong> that is stamped on your photo.
          </p>
        </Section>

        <Section title="What SpotCam uses, and why">
          <p>
            <strong className="text-white">Camera.</strong> SpotCam asks your browser for camera access to show the live preview and take
            photos. The video is not recorded and is never sent anywhere.
          </p>
          <p>
            <strong className="text-white">Location.</strong> SpotCam asks for your location (GPS) so it can print the date, time,
            coordinates and address onto each photo. Your coordinates are used on your device to draw the stamp, and they are also sent to
            a third party to get the address (see "Services we rely on" below). SpotCam does not keep a history of where you have been. To avoid repeating address lookups, your browser keeps the addresses it has already found, with the coordinates they were found for, in its storage on this device for up to 30 days. It also remembers the last address it found, so the camera can show it straight away. This is never sent anywhere. You can clear it, or change how far it reaches, in Settings, and clearing this site's data in your browser also removes it.
          </p>
          <p>
            <strong className="text-white">Your photos.</strong> When you take a photo, it is saved in your browser's storage (IndexedDB)
            on your device, together with its date, time and location. SpotCam keeps your latest 12 photos and replaces the oldest as you
            take new ones. Photos are not uploaded to us or to anyone else.
          </p>
          <p>
            <strong className="text-white">Working offline.</strong> So that SpotCam opens without a connection, your browser keeps a copy of
            the app's own files (its pages, scripts and images) in its cache on this device. This copy holds no photos and no location
            data, it is replaced when a new version is released, and clearing this site's data in your browser removes it.
          </p>
        </Section>

        <Section title="Services we rely on">
          <p>
            <strong className="text-white">Address lookup services.</strong> To turn your coordinates into an address, your browser sends
            them directly to a public geocoding service. It tries <strong className="text-white">Photon</strong> (run by Komoot, using
            OpenStreetMap data) first. If that is unavailable it falls back to <strong className="text-white">BigDataCloud</strong>, and then
            to <strong className="text-white">OpenStreetMap Nominatim</strong>. Only the service that answers receives your coordinates, and
            like any website request it also sees your IP address and basic browser details. We do not receive or store this information.
            See the privacy policies of{' '}
            <ExternalLink href="https://photon.komoot.io/">Photon</ExternalLink>,{' '}
            <ExternalLink href="https://www.bigdatacloud.com/privacy">BigDataCloud</ExternalLink> and the{' '}
            <ExternalLink href="https://osmfoundation.org/wiki/Privacy_Policy">OpenStreetMap Foundation</ExternalLink>. Map data ©
            OpenStreetMap contributors.
          </p>
          <p>
            <strong className="text-white">GitHub Pages (hosting).</strong> The SpotCam website is served by GitHub Pages. When you open
            the site, GitHub may log technical information such as your IP address, as described in the{' '}
            <ExternalLink href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement">
              GitHub privacy statement
            </ExternalLink>
            . SpotCam itself does not see these logs.
          </p>
          <p>
            <strong className="text-white">Sharing.</strong> If you tap Share, your device's share sheet opens and you choose where the
            photo goes. SpotCam does not see or control what happens after that. The date, time, coordinates and address are printed on
            the picture itself, so anyone you send it to can see where and when it was taken. Share with care.
          </p>
        </Section>

        {analyticsOn && (
          <Section title="Visit statistics (Google Analytics)">
            <p>
              If you agree when asked, SpotCam uses <strong className="text-white">Google Analytics</strong> to count visits, so we can see
              which pages are used and improve the site. Nothing is sent to Google before you agree, and nothing is sent at all if your
              browser asks not to be tracked (Do Not Track or Global Privacy Control).
            </p>
            <p>
              <strong className="text-white">What is collected:</strong> which page was opened, a few plain events (Start Cam was tapped, a
              photo was taken, a photo was shared, the app was installed, or camera or location was blocked, with only which of the two), and
              what Google's tag normally records about a visit, such as your browser, device type, approximate region from your IP address,
              and a random ID in a cookie. <strong className="text-white">Never sent:</strong> your photos, coordinates, address or anything
              from the stamp. Ad personalisation and advertising features are switched off.
            </p>
            <p>
              <strong className="text-white">Your choice:</strong> change it any time in Settings. Choosing "No thanks" there stops counting
              and removes Google's cookies for this site. Read Google's own{' '}
              <ExternalLink href="https://policies.google.com/technologies/partner-sites">explanation of how it uses data</ExternalLink>.
            </p>
          </Section>
        )}

        <Section title="What we don't do">
          <ul className="list-disc space-y-1.5 pl-6">
            <li>We don't have accounts or ask for your name or email.</li>
            <li>
              SpotCam itself doesn't set cookies. It uses your browser's storage only to keep your photos and settings.
              {analyticsOn && ' Only if you agree to visit counting (see below) does Google Analytics set its own cookies.'}
            </li>
            <li>We don't upload, sell or share your photos or location history.</li>
          </ul>
        </Section>

        <Section title="Your choices and control">
          <ul className="list-disc space-y-1.5 pl-6">
            <li>
              <strong className="text-white">Delete a photo</strong> from the gallery at any time. This removes it from your device.
            </li>
            <li>
              <strong className="text-white">Delete everything</strong> by clearing this site's data in your browser settings.
            </li>
            <li>
              <strong className="text-white">Withdraw permissions</strong> for the camera or location in your browser's site settings.
              SpotCam can't take stamped photos without them, but nothing else is affected.
            </li>
          </ul>
          <p>
            Because we hold no copy of your photos or personal data, there is nothing on our side to access, correct or delete: it is all
            under your control on your device.
          </p>
        </Section>

        <Section title="Children">
          <p>
            SpotCam doesn't collect personal information from anyone, including children. Because it can reveal a person's location,
            children should use it with a parent or guardian.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If SpotCam changes in a way that affects your privacy (for example, a different address service), we will update this page and
            the date at the top.
          </p>
        </Section>
      </main>
    </div>
  );
};
