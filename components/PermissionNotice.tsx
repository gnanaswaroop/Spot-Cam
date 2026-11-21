/**
 * @file Friendly "we need this permission" notice with browser-specific recovery steps.
 *
 * Browsers never re-show a permission prompt once it has been blocked, and a page cannot reset
 * it. So: if the browser reports the permission as 'denied' we show the manual steps up front and
 * a Reload button. Otherwise we can still ask again, so the primary button re-requests it.
 */

import React, { useEffect } from 'react';
import { PermissionName, getEnableSteps } from '../utils/permissionHelp';
import { track } from '../utils/analytics';
import { useT } from '../utils/i18n';

interface PermissionNoticeProps {
  title: string;
  message: string;
  /** Which permission is missing. Enables the "how to turn it on" steps. */
  what?: PermissionName;
  /** True when the browser reports the permission as permanently denied (it will not prompt again). */
  hardBlocked?: boolean;
  /** Re-request the permission. */
  onRetry: () => void;
}

const primaryButton =
  'px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-full shadow-lg shadow-blue-600/30 hover:bg-blue-500';

export const PermissionNotice: React.FC<PermissionNoticeProps> = ({ title, message, what, hardBlocked, onRetry }) => {
  const { t } = useT();
  // Which kind of permission was blocked, and nothing else.
  useEffect(() => {
    if (what === 'Camera') track('permission_blocked', 'camera');
    if (what === 'Location') track('permission_blocked', 'location');
  }, [what]);
  return (
  <div className="max-w-sm max-h-full overflow-y-auto p-6 text-center text-white short:p-3 short:max-w-md" role="alert">
    <h2 className="mb-3 text-xl font-semibold text-red-400">
      {/* A symbol as well as the red colour, so the problem is not signalled by colour alone. */}
      <span aria-hidden="true" className="mr-2">&#9888;</span>
      {title}
    </h2>
    <p className="mb-5 text-gray-300">{message}</p>

    {hardBlocked ? (
      <button onClick={() => window.location.reload()} className={primaryButton}>
        {t('common.reloadPage')}
      </button>
    ) : (
      <button onClick={onRetry} className={primaryButton}>
        {what ? t('perm.allow') : t('perm.tryAgain')}
      </button>
    )}

    {what && (
      <details open={hardBlocked} className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3 text-left text-sm">
        <summary className="cursor-pointer text-center text-gray-300">
          {hardBlocked ? t(what === 'Camera' ? 'perm.howToCamera' : 'perm.howToLocation') : t('perm.noPrompt')}
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-gray-300">
          {getEnableSteps(what).map(step => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {!hardBlocked && (
          <button onClick={() => window.location.reload()} className="mt-3 block w-full text-center text-blue-400 underline">
            {t('common.reloadPage')}
          </button>
        )}
      </details>
    )}
  </div>
  );
};
