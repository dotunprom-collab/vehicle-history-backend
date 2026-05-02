/* CheapRegCheck shared nav loader.
   Injects /partials/nav.html into <div id="nav-mount"></div> on every page,
   then wires up scroll-shadow, burger menu, and active-link highlighting. */
(function () {
  'use strict';

  const MOUNT_ID = 'nav-mount';
  const NAV_PARTIAL_URL = '/partials/nav.html';

  function injectNav() {
    const mount = document.getElementById(MOUNT_ID);
    if (!mount) {
      console.warn('[nav-loader] No element with id="nav-mount" found on this page.');
      return;
    }

    fetch(NAV_PARTIAL_URL, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('Nav fetch failed: ' + res.status);
        return res.text();
      })
      .then(function (html) {
        mount.innerHTML = html;
        wireUp();
        markActive();
      })
      .catch(function (err) {
        console.error('[nav-loader] Could not load nav:', err);
        // Fallback: render a minimal nav so the page is still usable.
        mount.innerHTML =
          '<nav id="nav" style="height:60px;display:flex;align-items:center;padding:0 24px;border-bottom:1px solid rgba(0,0,0,0.08);">' +
          '<a href="/index.html" style="font-weight:700;text-decoration:none;color:inherit;">CheapRegCheck</a>' +
          '</nav>';
      });
  }

  function wireUp() {
    // Burger menu toggle
    const burger = document.getElementById('burger');
    const mob = document.getElementById('mob');
    if (burger && mob) {
      burger.addEventListener('click', function () {
        burger.classList.toggle('open');
        mob.classList.toggle('open');
      });
      // Close mobile menu when a link is tapped
      mob.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          burger.classList.remove('open');
          mob.classList.remove('open');
        });
      });
    }

    // Scroll-shadow effect (matches your existing nav.scrolled CSS hook)
    const navEl = document.getElementById('nav');
    if (navEl) {
      const onScroll = function () {
        if (window.scrollY > 8) navEl.classList.add('scrolled');
        else navEl.classList.remove('scrolled');
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
  }

  function markActive() {
    // Highlight the current page in nav-center and mobile-menu.
    const path = window.location.pathname.replace(/\/$/, '') || '/index.html';
    document
      .querySelectorAll('.nav-center a, .mobile-menu a')
      .forEach(function (a) {
        const href = a.getAttribute('href') || '';
        const cleanHref = href.split('#')[0].replace(/\/$/, '');
        if (
          cleanHref === path ||
          (path === '' && cleanHref === '/index.html') ||
          (path === '/' && cleanHref === '/index.html')
        ) {
          a.classList.add('is-active');
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNav);
  } else {
    injectNav();
  }
})();