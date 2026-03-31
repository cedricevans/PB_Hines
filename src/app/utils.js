import { REQUEST_TYPES } from './constants';

export function getRouteView() {
  if (typeof window === 'undefined') {
    return 'public';
  }

  const url = new URL(window.location.href);

  if (url.pathname.endsWith('/admin') || url.searchParams.get('view') === 'admin' || url.hash === '#admin') {
    return 'admin';
  }

  return 'public';
}

export function formatDateTime(value) {
  if (!value) {
    return 'Pending';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function blankToNull(value) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function getStatusTone(statusKind) {
  switch (statusKind) {
    case 'live':
      return 'is-live';
    case 'archive':
      return 'is-archive';
    case 'setup':
      return 'is-setup';
    default:
      return 'is-loading';
  }
}

export function buildDefaultSubject(formState, selectedBranch, selectedMember) {
  const requestLabel = REQUEST_TYPES.find((type) => type.value === formState.requestType)?.label ?? 'Family update';
  const proposedName = formState.proposedName.trim();
  const targetLabel = (selectedMember?.displayName ?? proposedName) || selectedBranch?.displayName;

  return targetLabel ? `${requestLabel}: ${targetLabel}` : requestLabel;
}
