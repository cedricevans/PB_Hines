import { useDeferredValue, useMemo } from 'react';
import { SUPPORTED_APPLY_TYPES } from '../../app/constants';
import { formatDateTime } from '../../app/utils';

export function AdminPage({
  tenant,
  hubData,
  hubStatus,
  adminState,
  authForm,
  authStatus,
  adminRequests,
  adminNoteById,
  adminBusyId,
  selectedBranchId,
  branchMembers,
  adminMemberSearch,
  onAuthFieldChange,
  onLogin,
  onSignOut,
  onRefresh,
  onBranchSelect,
  onAdminMemberSearch,
  onAdminNoteChange,
  onAdminAction,
}) {
  const deferredSearch = useDeferredValue(adminMemberSearch);
  const filteredBranchMembers = useMemo(() => {
    if (!deferredSearch.trim()) {
      return branchMembers;
    }

    const query = deferredSearch.toLowerCase();
    return branchMembers.filter((member) => member.displayName.toLowerCase().includes(query));
  }, [branchMembers, deferredSearch]);

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <a className="shell-brand" href="/">
          P.B. Hines Foundation
        </a>
        <div className="admin-actions">
          <a className="ghost-button" href="/">
            Public site
          </a>
          {adminState.user ? (
            <button className="ghost-button" type="button" onClick={onSignOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      <section className="admin-hero">
        <div className="section-heading">
          <span className="section-label">Admin Console</span>
          <h1>
            Review Requests, <em>Manage Visibility</em>, Keep The Archive Moving
          </h1>
        </div>
        <p className="admin-hero-copy">{hubStatus.message}</p>
      </section>

      <section className="admin-dashboard-grid">
        <article className="panel-card">
          <h3>Session & Access</h3>
          <div className="admin-summary-list">
            <span>Tenant: {tenant?.display_name ?? 'Not loaded'}</span>
            <span>Signed in: {adminState.user?.email ?? 'No active session'}</span>
            <span>Admin rights: {adminState.isAdmin ? 'Granted' : 'Not granted'}</span>
            <span>Visible branches: {hubData.summaryStats.branches}</span>
          </div>

          {!adminState.user ? (
            <form className="admin-login-form" onSubmit={onLogin}>
              <label className="form-field">
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  value={authForm.email}
                  onChange={onAuthFieldChange}
                  placeholder="cedric.evans@gmail.com"
                  required
                />
              </label>

              <label className="form-field">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  value={authForm.password}
                  onChange={onAuthFieldChange}
                  placeholder="Your Supabase password"
                  required
                />
              </label>

              <button className="primary-button" type="submit" disabled={authStatus.status === 'submitting'}>
                {authStatus.status === 'submitting' ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : null}

          {(authStatus.message || adminState.error) && (
            <div className={`status-banner ${authStatus.status === 'error' || adminState.error ? 'error' : 'success'}`}>
              <strong>{adminState.error ? 'Admin check' : 'Session status'}</strong>
              <span>{adminState.error || authStatus.message}</span>
            </div>
          )}
        </article>

        <article className="panel-card">
          <h3>Request Workflow</h3>
          <ol className="flow-list compact">
            <li>Review request details and branch context.</li>
            <li>Move the request to `under_review`, `approved`, or `rejected`.</li>
            <li>Apply additive updates for new members, branch extensions, education, and locations.</li>
          </ol>
          <button className="ghost-button dark" type="button" onClick={onRefresh}>
            Refresh Queue
          </button>
        </article>
      </section>

      <section className="admin-content-grid">
        <article className="panel-card">
          <div className="panel-header stack-mobile">
            <div>
              <span className="section-label">Request Queue</span>
              <h3>Incoming Family Updates</h3>
            </div>
            <span className="badge">{adminRequests.length} requests</span>
          </div>

          {!adminState.user ? (
            <div className="empty-note">Sign in above to load the admin queue.</div>
          ) : !adminState.isAdmin ? (
            <div className="empty-note">This user is signed in but is not being recognized as a Hines tenant admin.</div>
          ) : adminRequests.length === 0 ? (
            <div className="empty-note">No family update requests are in the queue yet.</div>
          ) : (
            <div className="request-list">
              {adminRequests.map((request) => (
                <article className="request-card" key={request.id}>
                  <div className="request-topline">
                    <span>{request.request_type.replace(/_/g, ' ')}</span>
                    <span>{request.status}</span>
                  </div>
                  <h4>{request.subject}</h4>
                  <p>{request.requester_name} · {request.requester_email}</p>
                  <p>Branch: {request.branch_name ?? 'Unassigned'} · {formatDateTime(request.created_at)}</p>
                  <pre>{JSON.stringify(request.proposed_payload ?? {}, null, 2)}</pre>

                  <label className="form-field">
                    <span>Admin note</span>
                    <textarea
                      rows={3}
                      value={adminNoteById[request.id] ?? ''}
                      onChange={(event) => onAdminNoteChange(request.id, event.target.value)}
                      placeholder="Archive review note"
                    />
                  </label>

                  <div className="admin-actions wrap">
                    <button
                      className="ghost-button dark"
                      type="button"
                      disabled={adminBusyId === request.id}
                      onClick={() => onAdminAction(request.id, 'under_review')}
                    >
                      Under review
                    </button>
                    <button
                      className="ghost-button dark"
                      type="button"
                      disabled={adminBusyId === request.id}
                      onClick={() => onAdminAction(request.id, 'approved')}
                    >
                      Approve
                    </button>
                    <button
                      className="ghost-button dark"
                      type="button"
                      disabled={adminBusyId === request.id}
                      onClick={() => onAdminAction(request.id, 'rejected')}
                    >
                      Reject
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={adminBusyId === request.id || !SUPPORTED_APPLY_TYPES.has(request.request_type)}
                      onClick={() => onAdminAction(request.id, 'apply')}
                    >
                      {adminBusyId === request.id ? 'Working...' : 'Apply'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="panel-card">
          <div className="panel-header stack-mobile">
            <div>
              <span className="section-label">Live Records</span>
              <h3>Branch And Member Visibility</h3>
            </div>
            <input
              className="filter-input"
              type="search"
              value={adminMemberSearch}
              onChange={onAdminMemberSearch}
              placeholder="Search current branch members"
            />
          </div>

          <div className="mini-branch-grid">
            {hubData.branches.map((branch) => (
              <button
                className={`mini-branch-card ${selectedBranchId === branch.id ? 'is-active' : ''}`}
                key={branch.id}
                type="button"
                onClick={() => onBranchSelect(branch.id)}
              >
                <strong>{branch.displayName}</strong>
                <span>{branch.memberCount} members</span>
              </button>
            ))}
          </div>

          <div className="roster-list admin-roster">
            {filteredBranchMembers.slice(0, 80).map((member) => (
              <div className="roster-row" key={member.id}>
                <strong>{member.displayName}</strong>
                <span>{member.datesLabel ?? `Generation ${member.generationLevel ?? 'unknown'}`}</span>
              </div>
            ))}
            {filteredBranchMembers.length === 0 ? <div className="empty-note">No visible members match this search.</div> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
