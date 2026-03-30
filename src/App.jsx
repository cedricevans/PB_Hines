import React, { useEffect, useMemo, useRef } from 'react';
import foundationHtml from '../pompey-hines-foundation.html?raw';

function extractBodyMarkup(html) {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : '';
}

function injectMobileMenu(html) {
  const mobileMenuMarkup = `
<button class="mobile-menu-button" type="button" aria-expanded="false" aria-label="Toggle navigation">
  <span></span>
  <span></span>
  <span></span>
</button>
<div class="mobile-menu" hidden>
  <div class="mobile-menu-inner">
    <a href="#legacy">Legacy</a>
    <a href="#family-tree">Family Tree</a>
    <a href="#descendants">Descendants</a>
    <a href="#education">Education</a>
  </div>
</div>`;

  return html.replace('</nav>', `${mobileMenuMarkup}</nav>`);
}

function prepareMarkup(html) {
  return injectMobileMenu(extractBodyMarkup(html))
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/onclick="showTree\('([^']+)'\)"/g, 'data-tree-target="$1"')
    .replace(/onclick="showDesc\('([^']+)'\)"/g, 'data-desc-target="$1"')
    .trim();
}

export default function App() {
  const containerRef = useRef(null);
  const markup = useMemo(() => prepareMarkup(foundationHtml), []);

  useEffect(() => {
    const root = containerRef.current;

    if (!root) {
      return undefined;
    }

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

    root.addEventListener('click', handleClick);
    window.addEventListener('resize', handleResize);

    return () => {
      closeMobileMenu();
      root.removeEventListener('click', handleClick);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, []);

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: markup }} />;
}
