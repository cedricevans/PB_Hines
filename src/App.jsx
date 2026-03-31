import { useEffect, useMemo, useState } from 'react';
import { siteContent } from './content';
import {
  applyFamilyUpdateRequest,
  checkCurrentUserAdmin,
  fetchBranchDirectory,
  fetchEducationFeed,
  fetchMemberDirectory,
  fetchTenant,
  listFamilyUpdateRequests,
  reviewFamilyUpdateRequest,
  submitFamilyUpdateRequest,
} from './lib/hinesApi';
import { supabase } from './lib/supabase';
import { EMPTY_AUTH_FORM, EMPTY_FORM } from './app/constants';
import { buildFallbackHubData, mapRemoteHubData } from './app/data';
import { blankToNull, buildDefaultSubject, getRouteView } from './app/utils';
import { PublicPage } from './components/public/PublicPage';
import { AdminPage } from './components/admin/AdminPage';

const fallbackHubData = buildFallbackHubData(siteContent);

export default function App() {
  const [routeView, setRouteView] = useState(getRouteView);
  const [hubData, setHubData] = useState(fallbackHubData);
  const [tenant, setTenant] = useState(null);
  const [hubStatus, setHubStatus] = useState({
    kind: 'loading',
    message: 'Connecting to the Hines archive.',
  });
  const [selectedBranchId, setSelectedBranchId] = useState(fallbackHubData.branches[0]?.id ?? null);
  const [memberSearch, setMemberSearch] = useState('');
  const [adminMemberSearch, setAdminMemberSearch] = useState('');
  const [formState, setFormState] = useState(EMPTY_FORM);
  const [submitState, setSubmitState] = useState({
    status: 'idle',
    message: '',
  });
  const [adminState, setAdminState] = useState({
    user: null,
    isAdmin: false,
    error: '',
  });
  const [authForm, setAuthForm] = useState(EMPTY_AUTH_FORM);
  const [authStatus, setAuthStatus] = useState({
    status: 'idle',
    message: '',
  });
  const [adminRequests, setAdminRequests] = useState([]);
  const [adminNoteById, setAdminNoteById] = useState({});
  const [adminBusyId, setAdminBusyId] = useState(null);

  useEffect(() => {
    const syncRoute = () => setRouteView(getRouteView());

    syncRoute();
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);

    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadPublicData() {
      try {
        const tenantResult = await fetchTenant();

        if (tenantResult.error) {
          throw tenantResult.error;
        }

        if (!tenantResult.data) {
          if (!ignore) {
            setHubStatus({
              kind: 'setup',
              message: 'The Hines tenant record is missing. The app is showing archive fallback content.',
            });
          }
          return;
        }

        const [branchResult, memberResult, educationResult] = await Promise.all([
          fetchBranchDirectory(),
          fetchMemberDirectory(),
          fetchEducationFeed(),
        ]);

        if (branchResult.error || memberResult.error || educationResult.error) {
          throw branchResult.error || memberResult.error || educationResult.error;
        }

        if (!ignore) {
          const mapped = mapRemoteHubData(branchResult.data ?? [], memberResult.data ?? [], educationResult.data ?? []);

          setTenant(tenantResult.data);
          setHubData(mapped);
          setSelectedBranchId((current) => current ?? mapped.branches[0]?.id ?? null);
          setHubStatus({
            kind: 'live',
            message: `Live archive connected for ${tenantResult.data.display_name}.`,
          });
        }
      } catch (error) {
        if (!ignore) {
          setHubStatus({
            kind: 'archive',
            message: 'Live archive data is unavailable, so the UI is using the embedded family archive.',
          });
        }
      }
    }

    loadPublicData();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadAdminIdentity() {
      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult.data.session ?? null;

      if (ignore) {
        return;
      }

      if (!session?.user) {
        setAdminState({
          user: null,
          isAdmin: false,
          error: '',
        });
        return;
      }

      const adminResult = await checkCurrentUserAdmin();
      const adminError =
        adminResult.error?.code === 'PGRST202'
          ? 'The admin public API wrappers are not installed yet.'
          : adminResult.error?.message ?? '';

      if (!ignore) {
        setAdminState({
          user: session.user,
          isAdmin: Boolean(adminResult.data),
          error: adminError,
        });
      }
    }

    loadAdminIdentity();

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const adminResult = session?.user ? await checkCurrentUserAdmin() : { data: false, error: null };
      const adminError =
        adminResult.error?.code === 'PGRST202'
          ? 'The admin public API wrappers are not installed yet.'
          : adminResult.error?.message ?? '';

      setAdminState({
        user: session?.user ?? null,
        isAdmin: Boolean(adminResult.data),
        error: adminError,
      });
    });

    return () => {
      ignore = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const loadAdminDashboard = async () => {
    const requestsResult = await listFamilyUpdateRequests();

    if (requestsResult.error) {
      throw requestsResult.error;
    }

    setAdminRequests(requestsResult.data ?? []);
  };

  useEffect(() => {
    if (routeView !== 'admin' || !adminState.user || !adminState.isAdmin) {
      return;
    }

    loadAdminDashboard().catch((error) => {
      setAuthStatus({
        status: 'error',
        message: error?.message ?? 'The request queue could not be loaded.',
      });
    });
  }, [routeView, adminState.user, adminState.isAdmin]);

  useEffect(() => {
    if (!selectedBranchId && hubData.branches[0]) {
      setSelectedBranchId(hubData.branches[0].id);
      return;
    }

    if (selectedBranchId && !hubData.branches.some((branch) => branch.id === selectedBranchId)) {
      setSelectedBranchId(hubData.branches[0]?.id ?? null);
    }
  }, [hubData.branches, selectedBranchId]);

  const activeBranch = useMemo(
    () => hubData.branches.find((branch) => branch.id === selectedBranchId) ?? hubData.branches[0] ?? null,
    [hubData.branches, selectedBranchId],
  );

  const branchMembers = useMemo(() => {
    if (!activeBranch) {
      return [];
    }

    return hubData.members
      .filter((member) => member.branchId === activeBranch.id)
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [activeBranch, hubData.members]);

  const branchEducation = useMemo(() => {
    if (!activeBranch) {
      return [];
    }

    return hubData.education
      .filter((record) => record.branchSlug === activeBranch.slug)
      .sort((left, right) => left.memberName.localeCompare(right.memberName));
  }, [activeBranch, hubData.education]);

  const availableMembers = useMemo(() => {
    if (!formState.branchId) {
      return [];
    }

    return hubData.members
      .filter((member) => member.branchId === formState.branchId)
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [formState.branchId, hubData.members]);

  const canSubmit = Boolean(tenant?.id);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;

    setFormState((current) => {
      if (name === 'branchId') {
        return {
          ...current,
          branchId: value,
          memberId: '',
        };
      }

      return {
        ...current,
        [name]: value,
      };
    });
  };

  const handleAuthFieldChange = (event) => {
    const { name, value } = event.target;
    setAuthForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitState({
      status: 'submitting',
      message: '',
    });

    if (!tenant) {
      setSubmitState({
        status: 'error',
        message: 'The Hines tenant is not available yet, so this request cannot be saved.',
      });
      return;
    }

    const selectedBranch = hubData.branches.find((branch) => branch.id === formState.branchId) ?? null;
    const selectedMember = availableMembers.find((member) => member.id === formState.memberId) ?? null;
    const evidenceUrls = formState.evidenceUrls
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    try {
      const result = await submitFamilyUpdateRequest({
        branch_id: formState.branchId || null,
        member_id: formState.memberId || null,
        request_type: formState.requestType,
        requester_name: formState.requesterName.trim(),
        requester_email: formState.requesterEmail.trim(),
        requester_phone: blankToNull(formState.requesterPhone),
        relationship_to_family: blankToNull(formState.relationshipToFamily),
        subject: blankToNull(formState.subject) ?? buildDefaultSubject(formState, selectedBranch, selectedMember),
        message: blankToNull(formState.message),
        proposed_payload: {
          branch_slug: selectedBranch?.slug ?? null,
          branch_name: selectedBranch?.displayName ?? null,
          linked_member_name: selectedMember?.displayName ?? null,
          proposed_name: blankToNull(formState.proposedName),
          current_location: blankToNull(formState.currentLocation),
          education_details: blankToNull(formState.educationDetails),
          request_type: formState.requestType,
        },
        evidence_urls: evidenceUrls,
      });

      if (result.error) {
        throw result.error;
      }

      setFormState(EMPTY_FORM);
      setSubmitState({
        status: 'success',
        message: `Family update submitted successfully. Reference ${String(result.data).slice(0, 8)}.`,
      });
    } catch (error) {
      setSubmitState({
        status: 'error',
        message: error?.message ?? 'The family update request could not be saved.',
      });
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setAuthStatus({
      status: 'submitting',
      message: '',
    });

    const result = await supabase.auth.signInWithPassword({
      email: authForm.email.trim(),
      password: authForm.password,
    });

    if (result.error) {
      setAuthStatus({
        status: 'error',
        message: result.error.message,
      });
      return;
    }

    setAuthForm((current) => ({
      ...current,
      password: '',
    }));
    setAuthStatus({
      status: 'success',
      message: `Signed in as ${result.data.user?.email ?? authForm.email.trim()}.`,
    });
  };

  const handleSignOut = async () => {
    const result = await supabase.auth.signOut();

    if (result.error) {
      setAuthStatus({
        status: 'error',
        message: result.error.message,
      });
      return;
    }

    setAuthStatus({
      status: 'success',
      message: 'Signed out.',
    });
  };

  const handleAdminNoteChange = (requestId, value) => {
    setAdminNoteById((current) => ({
      ...current,
      [requestId]: value,
    }));
  };

  const handleAdminAction = async (requestId, action) => {
    setAdminBusyId(requestId);

    try {
      const note = adminNoteById[requestId] ?? null;
      const result =
        action === 'apply'
          ? await applyFamilyUpdateRequest(requestId, note)
          : await reviewFamilyUpdateRequest(requestId, action, note);

      if (result.error) {
        throw result.error;
      }

      await loadAdminDashboard();
    } catch (error) {
      setAuthStatus({
        status: 'error',
        message: error?.message ?? 'The admin action failed.',
      });
    } finally {
      setAdminBusyId(null);
    }
  };

  const handlePrefillMemberUpdate = (member) => {
    const targetBranch = hubData.branches.find((branch) => branch.id === member.branchId) ?? activeBranch ?? null;

    setSelectedBranchId(member.branchId ?? targetBranch?.id ?? null);
    setSubmitState({
      status: 'idle',
      message: '',
    });
    setFormState((current) => ({
      ...current,
      branchId: member.branchId ?? current.branchId,
      memberId: member.id,
      requestType: 'member_edit',
      proposedName: current.proposedName || member.displayName,
      subject: current.subject || `Update for ${member.displayName}`,
      message:
        current.message ||
        `Sharing an update about ${member.displayName}${targetBranch?.displayName ? ` from the ${targetBranch.displayName} branch` : ''}.`,
    }));
  };

  if (routeView === 'admin') {
    return (
      <AdminPage
        tenant={tenant}
        hubData={hubData}
        hubStatus={hubStatus}
        adminState={adminState}
        authForm={authForm}
        authStatus={authStatus}
        adminRequests={adminRequests}
        adminNoteById={adminNoteById}
        adminBusyId={adminBusyId}
        selectedBranchId={activeBranch?.id ?? null}
        branchMembers={branchMembers}
        adminMemberSearch={adminMemberSearch}
        onAuthFieldChange={handleAuthFieldChange}
        onLogin={handleLogin}
        onSignOut={handleSignOut}
        onRefresh={() => loadAdminDashboard().catch(() => undefined)}
        onBranchSelect={setSelectedBranchId}
        onAdminMemberSearch={(event) => setAdminMemberSearch(event.target.value)}
        onAdminNoteChange={handleAdminNoteChange}
        onAdminAction={handleAdminAction}
      />
    );
  }

  return (
    <PublicPage
      hubData={hubData}
      hubStatus={hubStatus}
      activeBranch={activeBranch}
      branchMembers={branchMembers}
      branchEducation={branchEducation}
      memberSearch={memberSearch}
      formState={formState}
      availableMembers={availableMembers}
      submitState={submitState}
      canSubmit={canSubmit}
      onBranchSelect={setSelectedBranchId}
      onMemberSearch={(event) => setMemberSearch(event.target.value)}
      onFieldChange={handleFieldChange}
      onSubmit={handleSubmit}
      onPrefillMemberUpdate={handlePrefillMemberUpdate}
    />
  );
}
