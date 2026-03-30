import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import foundationHtml from '../pompey-hines-foundation.html?raw';
import { siteContent } from './content';
import { supabase, supabaseProjectHost } from './lib/supabase';

const TENANT_SLUG = 'hines';

const HUB_LINKS = [
  { href: '#family-records', label: 'Records' },
  { href: '#family-updates', label: 'Updates' },
];

const REQUEST_TYPES = [
  { value: 'member_edit', label: 'Correct a member' },
  { value: 'new_member', label: 'Add a family member' },
  { value: 'education_update', label: 'Add a graduation' },
  { value: 'location_update', label: 'Update where family lives' },
  { value: 'relationship_update', label: 'Fix a relationship' },
  { value: 'new_branch', label: 'Start a new branch' },
  { value: 'photo_update', label: 'Add a photo or record' },
];

const REQUEST_HINTS = {
  member_edit:
    'Correct names, dates, spelling, biography details, or branch placement for an existing person.',
  new_member:
    'Add a relative to an existing branch with names, parent links, dates, and family context.',
  education_update:
    'Include degree, school, graduation year, honors, and who the graduate belongs to in the tree.',
  location_update:
    'Share where a family line lives now, including city, state, and who moved there.',
  relationship_update:
    'Clarify parent-child, spouse, guardian, or sibling relationships in the branch structure.',
  new_branch:
    'Use this when a line needs to branch out from an existing record or a missing line needs to be added.',
  photo_update:
    'Submit scans, photos, obituaries, programs, or documents that support the record update.',
};

const EMPTY_FORM = {
  requestType: 'member_edit',
  requesterName: '',
  requesterEmail: '',
  requesterPhone: '',
  relationshipToFamily: '',
  branchId: '',
  memberId: '',
  subject: '',
  proposedName: '',
  currentLocation: '',
  educationDetails: '',
  message: '',
  evidenceUrls: '',
};

function extractBodyMarkup(html) {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : '';
}

function injectDesktopLinks(html) {
  const extraLinks = HUB_LINKS.map((link) => `<li><a href="${link.href}">${link.label}</a></li>`).join('');

  return html.replace(
    /<ul class="nav-links">([\s\S]*?)<\/ul>/i,
    (_match, linksMarkup) => `<ul class="nav-links">${linksMarkup}${extraLinks}</ul>`,
  );
}

function injectMobileMenu(html) {
  const mobileLinks = [
    { href: '#legacy', label: 'Legacy' },
    { href: '#family-tree', label: 'Family Tree' },
    { href: '#descendants', label: 'Descendants' },
    { href: '#education', label: 'Education' },
    ...HUB_LINKS,
  ];

  const mobileMenuMarkup = `
<button class="mobile-menu-button" type="button" aria-expanded="false" aria-label="Toggle navigation">
  <span></span>
  <span></span>
  <span></span>
</button>
<div class="mobile-menu" hidden>
  <div class="mobile-menu-inner">
    ${mobileLinks.map((link) => `<a href="${link.href}">${link.label}</a>`).join('')}
  </div>
</div>`;

  return html.replace('</nav>', `${mobileMenuMarkup}</nav>`);
}

function injectHubMount(html) {
  return html.replace(/<footer>/i, '<div id="family-hub-root"></div><footer>');
}

function prepareMarkup(html) {
  return injectHubMount(injectMobileMenu(injectDesktopLinks(extractBodyMarkup(html))))
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/onclick="showTree\('([^']+)'\)"/g, 'data-tree-target="$1"')
    .replace(/onclick="showDesc\('([^']+)'\)"/g, 'data-desc-target="$1"')
    .trim();
}

function splitNames(text) {
  return text
    .split('·')
    .map((name) => name.trim())
    .filter(Boolean);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function branchSlugFromEducationLabel(label) {
  const branchMap = new Map([
    ['Theodore Ball Branch', 'theodore'],
    ['Julian H. Hines Branch', 'julian'],
    ['Abbie Hines Clanton Branch', 'abbie'],
    ['Annie Hines Levant Branch', 'annie'],
    ['James E. Hines Branch', 'james'],
    ['Doyle L. Hines Branch', 'doyle'],
    ['Esther Hines Simmons Branch', 'esther'],
    ['Pompey H. Hines Branch', 'pompeyh'],
  ]);

  return branchMap.get(label) ?? slugify(label.replace(/\s+branch$/i, ''));
}

function parseEducationItem(item) {
  const [memberName, credentialSummary] = item.split(/\s{2,}/);
  const yearMatch = credentialSummary?.match(/\b(18|19|20)\d{2}\b/);

  return {
    memberName: memberName?.trim() ?? item.trim(),
    credentialSummary: credentialSummary?.trim() ?? null,
    graduationYear: yearMatch ? Number(yearMatch[0]) : null,
  };
}

function buildFallbackHubData(content) {
  const descendantCounts = new Map();

  content.descendants.branches.forEach((branch) => {
    const branchSlug = branch.id.replace(/^d-/, '');
    const totalMembers = branch.groups.reduce((count, group) => count + splitNames(group.text).length, 0);
    descendantCounts.set(branchSlug, totalMembers);
  });

  const degreeCounts = new Map();
  const educationRecords = [];

  content.education.degrees.forEach((branch) => {
    const branchSlug = branchSlugFromEducationLabel(branch.branch);
    degreeCounts.set(branchSlug, branch.items.length);

    branch.items.forEach((item, index) => {
      const parsed = parseEducationItem(item);
      educationRecords.push({
        id: `fallback-education-${branchSlug}-${index + 1}`,
        branchSlug,
        branchLabel: branch.branch.replace(/\s+Branch$/i, ''),
        memberName: parsed.memberName,
        credentialSummary: parsed.credentialSummary ?? item,
        graduationYear: parsed.graduationYear,
      });
    });
  });

  const founderMembers = content.familyTree.branches.map((branch) => ({
    id: `fallback-${branch.id}`,
    branchId: `fallback-branch-${branch.id}`,
    displayName: branch.name,
    datesLabel: branch.dates,
  }));

  return {
    branches: content.familyTree.branches.map((branch) => ({
      id: `fallback-branch-${branch.id}`,
      slug: branch.id,
      displayName: branch.name,
      founderName: branch.name,
      datesLabel: branch.dates,
      summary: branch.paragraphs[0],
      treeNumber: Number(branch.treeNumber.match(/(\d+)/)?.[1] ?? 0),
      memberCount: (descendantCounts.get(branch.id) ?? 0) + 1,
      degreeCount: degreeCounts.get(branch.id) ?? 0,
    })),
    members: founderMembers,
    education: educationRecords,
  };
}

function mapRemoteHubData(branches, members, education) {
  const membersByBranchId = new Map();
  const degreeCountsByBranchId = new Map();

  members.forEach((member) => {
    const branchMembers = membersByBranchId.get(member.branch_id) ?? [];
    branchMembers.push(member);
    membersByBranchId.set(member.branch_id, branchMembers);
  });

  education.forEach((record) => {
    degreeCountsByBranchId.set(record.branch_id, (degreeCountsByBranchId.get(record.branch_id) ?? 0) + 1);
  });

  const branchOrder = new Map();
  const mappedBranches = [...branches]
    .sort((left, right) => (left.tree_number ?? 999) - (right.tree_number ?? 999))
    .map((branch, index) => {
      branchOrder.set(branch.id, index);
      const branchMembers = membersByBranchId.get(branch.id) ?? [];
      const founder =
        branchMembers.find((member) => member.id === branch.founder_member_id) ??
        branchMembers.find((member) => member.is_branch_founder) ??
        null;

      return {
        id: branch.id,
        slug: branch.slug,
        displayName: branch.display_name,
        founderName: founder?.display_name ?? branch.display_name,
        datesLabel: founder?.dates_label ?? null,
        summary:
          Array.isArray(founder?.biography) && founder.biography.length > 0
            ? founder.biography[0]
            : 'This branch is now managed through the live family archive.',
        treeNumber: branch.tree_number ?? index + 1,
        memberCount: branchMembers.length,
        degreeCount: degreeCountsByBranchId.get(branch.id) ?? 0,
      };
    });

  const branchNameById = new Map(mappedBranches.map((branch) => [branch.id, branch.displayName]));

  const mappedEducation = [...education]
    .sort((left, right) => {
      const leftOrder = branchOrder.get(left.branch_id) ?? 999;
      const rightOrder = branchOrder.get(right.branch_id) ?? 999;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return (left.sort_order ?? 0) - (right.sort_order ?? 0);
    })
    .map((record) => ({
      id: record.id,
      branchSlug: mappedBranches.find((branch) => branch.id === record.branch_id)?.slug ?? 'family',
      branchLabel: branchNameById.get(record.branch_id) ?? 'Family branch',
      memberName: record.member_name,
      credentialSummary: record.credential_summary ?? record.raw_text,
      graduationYear: record.graduation_year,
    }));

  return {
    branches: mappedBranches,
    members: [...members]
      .map((member) => ({
        id: member.id,
        branchId: member.branch_id,
        displayName: member.display_name,
        datesLabel: member.dates_label,
      }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    education: mappedEducation,
  };
}

function blankToNull(value) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildDefaultSubject(formState, selectedBranch, selectedMember) {
  const requestLabel = REQUEST_TYPES.find((type) => type.value === formState.requestType)?.label ?? 'Family update';
  const proposedName = formState.proposedName.trim();
  const targetLabel = (selectedMember?.displayName ?? proposedName) || selectedBranch?.displayName;

  return targetLabel ? `${requestLabel}: ${targetLabel}` : requestLabel;
}

function getStatusDetails(status) {
  switch (status.kind) {
    case 'live':
      return {
        badge: 'Live records connected',
        tone: 'is-live',
      };
    case 'setup':
      return {
        badge: 'Seed required',
        tone: 'is-setup',
      };
    case 'archive':
      return {
        badge: 'Archive fallback',
        tone: 'is-archive',
      };
    default:
      return {
        badge: 'Connecting to archive',
        tone: 'is-loading',
      };
  }
}

function FamilyHub({
  hubData,
  hubStatus,
  canSubmit,
  formState,
  availableMembers,
  submitState,
  onFieldChange,
  onBranchChange,
  onSubmit,
}) {
  const statusDetails = getStatusDetails(hubStatus);
  const totalDegrees = hubData.education.length;

  return (
    <>
      <section className="records-section" id="family-records">
        <div className="records-inner">
          <span className="section-label">Family Hub</span>
          <h2 className="section-title">
            Live Records & <em>Branch Stewardship</em>
          </h2>
          <div className="gold-rule" />
          <div className={`hub-status ${statusDetails.tone}`}>
            <strong>{statusDetails.badge}</strong>
            <span>{hubStatus.message}</span>
          </div>

          <div className="hub-summary-grid">
            <article className="hub-panel">
              <h3>Branch Directory</h3>
              <p className="hub-panel-copy">
                Each branch card summarizes the family founder, the currently loaded descendant count, and the
                graduation records connected to that line.
              </p>
              <div className="hub-mini-stats">
                <div className="hub-mini-stat">
                  <strong>{hubData.branches.length}</strong>
                  <span>Branches</span>
                </div>
                <div className="hub-mini-stat">
                  <strong>{hubData.branches.reduce((total, branch) => total + branch.memberCount, 0)}</strong>
                  <span>Members Loaded</span>
                </div>
                <div className="hub-mini-stat">
                  <strong>{totalDegrees}</strong>
                  <span>Education Records</span>
                </div>
              </div>
              <div className="record-grid">
                {hubData.branches.map((branch) => (
                  <article className="record-card" key={branch.id}>
                    <div className="record-card-topline">
                      <span>Tree {branch.treeNumber}</span>
                      <span>{branch.memberCount} members</span>
                    </div>
                    <h4>{branch.displayName}</h4>
                    <p className="record-card-dates">{branch.datesLabel ?? 'Dates pending verification'}</p>
                    <p className="record-card-summary">{branch.summary}</p>
                    <div className="record-card-meta">
                      <span>Founder: {branch.founderName}</span>
                      <span>{branch.degreeCount} education records</span>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="hub-panel">
              <h3>Education Feed</h3>
              <p className="hub-panel-copy">
                Graduation history lives alongside the family tree so branches can keep celebrating new degrees as
                they happen.
              </p>
              <div className="education-feed">
                {hubData.education.slice(0, 16).map((record) => (
                  <article className="education-feed-item" key={record.id}>
                    <div className="education-feed-branch">{record.branchLabel}</div>
                    <h4>{record.memberName}</h4>
                    <p>{record.credentialSummary}</p>
                    {record.graduationYear ? <span>{record.graduationYear}</span> : null}
                  </article>
                ))}
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="updates-section" id="family-updates">
        <div className="updates-inner">
          <div className="updates-copy">
            <span className="section-label">Contribute</span>
            <h2 className="section-title">
              Request a <em>Family Update</em>
            </h2>
            <div className="gold-rule" />
            <p className="updates-copy-text">
              Families can submit new members, graduation records, relationship fixes, photos, and location updates.
              Every request lands in the review queue for the Hines archive team.
            </p>

            <div className="guide-grid">
              {REQUEST_TYPES.slice(0, 4).map((type) => (
                <article className="guide-card" key={type.value}>
                  <h3>{type.label}</h3>
                  <p>{REQUEST_HINTS[type.value]}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="hub-panel update-panel">
            <form className="update-form" onSubmit={onSubmit}>
              <div className="form-grid">
                <label className="form-field">
                  <span>Request type</span>
                  <select name="requestType" value={formState.requestType} onChange={onFieldChange}>
                    {REQUEST_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span>Family branch</span>
                  <select name="branchId" value={formState.branchId} onChange={onBranchChange}>
                    <option value="">Select a branch</option>
                    {hubData.branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span>Your name</span>
                  <input
                    name="requesterName"
                    type="text"
                    value={formState.requesterName}
                    onChange={onFieldChange}
                    placeholder="Full name"
                    required
                  />
                </label>

                <label className="form-field">
                  <span>Email</span>
                  <input
                    name="requesterEmail"
                    type="email"
                    value={formState.requesterEmail}
                    onChange={onFieldChange}
                    placeholder="you@example.com"
                    required
                  />
                </label>

                <label className="form-field">
                  <span>Phone</span>
                  <input
                    name="requesterPhone"
                    type="tel"
                    value={formState.requesterPhone}
                    onChange={onFieldChange}
                    placeholder="Optional"
                  />
                </label>

                <label className="form-field">
                  <span>Relationship to family</span>
                  <input
                    name="relationshipToFamily"
                    type="text"
                    value={formState.relationshipToFamily}
                    onChange={onFieldChange}
                    placeholder="Branch member, cousin, grandchild, researcher"
                  />
                </label>

                <label className="form-field form-field-wide">
                  <span>Linked family member</span>
                  <select
                    name="memberId"
                    value={formState.memberId}
                    onChange={onFieldChange}
                    disabled={!availableMembers.length}
                  >
                    <option value="">
                      {availableMembers.length ? 'Select an existing record' : 'Choose a branch first'}
                    </option>
                    {availableMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field form-field-wide">
                  <span>Person or branch to add/update</span>
                  <input
                    name="proposedName"
                    type="text"
                    value={formState.proposedName}
                    onChange={onFieldChange}
                    placeholder="Name of the person, household, or branch being discussed"
                  />
                </label>

                <label className="form-field form-field-wide">
                  <span>Subject</span>
                  <input
                    name="subject"
                    type="text"
                    value={formState.subject}
                    onChange={onFieldChange}
                    placeholder="Optional. A subject is generated automatically if left blank."
                  />
                </label>

                <label className="form-field">
                  <span>Current location</span>
                  <input
                    name="currentLocation"
                    type="text"
                    value={formState.currentLocation}
                    onChange={onFieldChange}
                    placeholder="City, state, or region"
                  />
                </label>

                <label className="form-field">
                  <span>Graduation details</span>
                  <input
                    name="educationDetails"
                    type="text"
                    value={formState.educationDetails}
                    onChange={onFieldChange}
                    placeholder="School, degree, year, honors"
                  />
                </label>

                <label className="form-field form-field-wide">
                  <span>What should change</span>
                  <textarea
                    name="message"
                    value={formState.message}
                    onChange={onFieldChange}
                    placeholder={REQUEST_HINTS[formState.requestType]}
                    rows={6}
                    required
                  />
                </label>

                <label className="form-field form-field-wide">
                  <span>Evidence URLs</span>
                  <textarea
                    name="evidenceUrls"
                    value={formState.evidenceUrls}
                    onChange={onFieldChange}
                    placeholder="One URL per line for photos, documents, scans, obituaries, or school records"
                    rows={4}
                  />
                </label>
              </div>

              <div className={`submit-banner status-${submitState.status}`}>
                <strong>
                  {canSubmit
                    ? 'Submissions are enabled.'
                    : 'Run the hines schema seed before submissions go live.'}
                </strong>
                <span>
                  {submitState.message ||
                    (canSubmit
                      ? 'New requests will be written to hines.family_update_requests.'
                      : 'The form is built, but the tenant tables must exist in Supabase before inserts will succeed.')}
                </span>
              </div>

              <button className="submit-button" type="submit" disabled={!canSubmit || submitState.status === 'submitting'}>
                {submitState.status === 'submitting' ? 'Submitting...' : 'Submit Family Update'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}

const fallbackHubData = buildFallbackHubData(siteContent);

export default function App() {
  const containerRef = useRef(null);
  const markup = useMemo(() => prepareMarkup(foundationHtml), []);
  const [hubMountNode, setHubMountNode] = useState(null);
  const [hubData, setHubData] = useState(fallbackHubData);
  const [tenant, setTenant] = useState(null);
  const [hubStatus, setHubStatus] = useState({
    kind: 'loading',
    message: 'Connecting to Supabase and checking the hines tenant archive.',
  });
  const [formState, setFormState] = useState(EMPTY_FORM);
  const [submitState, setSubmitState] = useState({
    status: 'idle',
    message: '',
  });

  useEffect(() => {
    const root = containerRef.current;

    if (!root) {
      return undefined;
    }

    setHubMountNode(root.querySelector('#family-hub-root'));

    const mobileMenuButton = root.querySelector('.mobile-menu-button');
    const mobileMenu = root.querySelector('.mobile-menu');

    const closeMobileMenu = () => {
      if (!mobileMenuButton || !mobileMenu) {
        return;
      }

      mobileMenuButton.classList.remove('active');
      mobileMenuButton.setAttribute('aria-expanded', 'false');
      mobileMenu.hidden = true;
      document.body.classList.remove('mobile-menu-open');
    };

    const openMobileMenu = () => {
      if (!mobileMenuButton || !mobileMenu) {
        return;
      }

      mobileMenuButton.classList.add('active');
      mobileMenuButton.setAttribute('aria-expanded', 'true');
      mobileMenu.hidden = false;
      document.body.classList.add('mobile-menu-open');
    };

    const handleClick = (event) => {
      const menuButton = event.target.closest('.mobile-menu-button');
      if (menuButton) {
        if (menuButton.classList.contains('active')) {
          closeMobileMenu();
        } else {
          openMobileMenu();
        }
        return;
      }

      const mobileMenuLink = event.target.closest('.mobile-menu a');
      if (mobileMenuLink) {
        closeMobileMenu();
      }

      const treeButton = event.target.closest('[data-tree-target]');
      if (treeButton) {
        const targetId = treeButton.getAttribute('data-tree-target');
        root.querySelectorAll('#family-tree .tree-content').forEach((element) => {
          element.classList.remove('active');
        });
        root.querySelectorAll('#family-tree .tree-tab').forEach((element) => {
          element.classList.remove('active');
        });
        root.querySelector(`#tree-${targetId}`)?.classList.add('active');
        treeButton.classList.add('active');
        return;
      }

      const descButton = event.target.closest('[data-desc-target]');
      if (descButton) {
        const targetId = descButton.getAttribute('data-desc-target');
        root.querySelectorAll('#descendants .tree-content').forEach((element) => {
          element.classList.remove('active');
        });
        root.querySelectorAll('#descendants .tree-tab').forEach((element) => {
          element.classList.remove('active');
        });
        root.querySelector(`#tree-${targetId}`)?.classList.add('active');
        descButton.classList.add('active');
      }
    };

    const handleResize = () => {
      if (window.innerWidth > 768) {
        closeMobileMenu();
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 },
    );

    root.querySelectorAll('.stat-card, .bio-card, .degree-branch').forEach((element) => {
      element.style.opacity = '0';
      element.style.transform = 'translateY(20px)';
      element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      observer.observe(element);
    });

    window.supabase = supabase;
    root.dataset.supabaseProject = supabaseProjectHost;

    root.addEventListener('click', handleClick);
    window.addEventListener('resize', handleResize);

    return () => {
      delete window.supabase;
      setHubMountNode(null);
      closeMobileMenu();
      root.removeEventListener('click', handleClick);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!hubMountNode) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );

    hubMountNode.querySelectorAll('.hub-panel, .record-card, .guide-card, .education-feed-item').forEach((element) => {
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [hubMountNode, hubData]);

  useEffect(() => {
    let ignore = false;

    async function loadHub() {
      try {
        const tenantResult = await supabase
          .from('tenants')
          .select('id, slug, display_name')
          .eq('slug', TENANT_SLUG)
          .maybeSingle();

        if (tenantResult.error) {
          throw tenantResult.error;
        }

        if (!tenantResult.data) {
          if (!ignore) {
            setHubStatus({
              kind: 'setup',
              message:
                'Supabase is connected, but the hines tenant has not been seeded yet. Run supabase/sql/hines-family-schema.sql to enable live records and submissions.',
            });
          }
          return;
        }

        const tenantRecord = tenantResult.data;
        const hinesDb = supabase.schema('hines');

        const [branchResult, memberResult, educationResult] = await Promise.all([
          hinesDb
            .from('family_branches')
            .select('id, slug, display_name, tab_label, tree_number, founder_member_id')
            .eq('tenant_id', tenantRecord.id)
            .order('tree_number', { ascending: true }),
          hinesDb
            .from('family_members')
            .select('id, branch_id, display_name, dates_label, biography, is_branch_founder')
            .eq('tenant_id', tenantRecord.id),
          hinesDb
            .from('member_education_records')
            .select('id, branch_id, member_name, credential_summary, graduation_year, raw_text, sort_order')
            .eq('tenant_id', tenantRecord.id)
            .order('sort_order', { ascending: true }),
        ]);

        if (branchResult.error) {
          throw branchResult.error;
        }
        if (memberResult.error) {
          throw memberResult.error;
        }
        if (educationResult.error) {
          throw educationResult.error;
        }

        if (!ignore) {
          setTenant(tenantRecord);
          setHubData(
            mapRemoteHubData(
              branchResult.data ?? [],
              memberResult.data ?? [],
              educationResult.data ?? [],
            ),
          );
          setHubStatus({
            kind: 'live',
            message: `Reading live branch, member, and education records from ${tenantRecord.display_name}.`,
          });
        }
      } catch (error) {
        if (!ignore) {
          setHubStatus({
            kind: 'archive',
            message: `Live records could not be loaded. Showing the published archive from the site content instead. ${
              error?.message ?? ''
            }`.trim(),
          });
        }
      }
    }

    loadHub();

    return () => {
      ignore = true;
    };
  }, []);

  const availableMembers = useMemo(() => {
    if (!formState.branchId) {
      return [];
    }

    return hubData.members
      .filter((member) => member.branchId === formState.branchId || member.branch_id === formState.branchId)
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [formState.branchId, hubData.members]);

  const canSubmit = Boolean(tenant?.id && hubStatus.kind === 'live');

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormState((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleBranchChange = (event) => {
    const { value } = event.target;
    setFormState((current) => ({
      ...current,
      branchId: value,
      memberId: '',
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitState({
      status: 'submitting',
      message: '',
    });

    if (!canSubmit || !tenant) {
      setSubmitState({
        status: 'error',
        message:
          'The request form is built, but the hines schema needs to exist in Supabase before this site can create live submissions.',
      });
      return;
    }

    const selectedBranch = hubData.branches.find((branch) => branch.id === formState.branchId) ?? null;
    const selectedMember = availableMembers.find((member) => member.id === formState.memberId) ?? null;
    const evidenceUrls = formState.evidenceUrls
      .split('\n')
      .map((url) => url.trim())
      .filter(Boolean);

    try {
      const insertResult = await supabase
        .schema('hines')
        .from('family_update_requests')
        .insert({
          tenant_id: tenant.id,
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
        })
        .select('id')
        .single();

      if (insertResult.error) {
        throw insertResult.error;
      }

      setFormState(EMPTY_FORM);
      setSubmitState({
        status: 'success',
        message: `Request submitted successfully. Reference ${insertResult.data.id.slice(0, 8)}.`,
      });
    } catch (error) {
      setSubmitState({
        status: 'error',
        message: error?.message ?? 'Something went wrong while saving the family update request.',
      });
    }
  };

  return (
    <>
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: markup }} />
      {hubMountNode
        ? createPortal(
            <FamilyHub
              hubData={hubData}
              hubStatus={hubStatus}
              canSubmit={canSubmit}
              formState={formState}
              availableMembers={availableMembers}
              submitState={submitState}
              onFieldChange={handleFieldChange}
              onBranchChange={handleBranchChange}
              onSubmit={handleSubmit}
            />,
            hubMountNode,
          )
        : null}
    </>
  );
}
