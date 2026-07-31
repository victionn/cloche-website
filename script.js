/* Cloche — site behaviour. No dependencies.
   Every effect checks prefers-reduced-motion and degrades to static. */

(function () {
  'use strict';

  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = matchMedia('(pointer: fine)').matches;

  /* ---------- Theme toggle + themed screenshots ----------
     App screenshots have pre-generated dark variants (assets/*-dark.png,
     recoloured with the app's own dark tokens); swap sources with the theme. */

  function syncMedia(theme) {
    document.querySelectorAll('img[data-dark-src]').forEach(function (img) {
      if (!img.dataset.lightSrc) img.dataset.lightSrc = img.getAttribute('src');
      var want = theme === 'dark' ? img.dataset.darkSrc : img.dataset.lightSrc;
      if (img.getAttribute('src') !== want) img.setAttribute('src', want);
    });
    // Video posters get the same treatment. The clip itself has no dark
    // recording and is recoloured in CSS instead.
    document.querySelectorAll('video[data-dark-poster]').forEach(function (vid) {
      if (!vid.dataset.lightPoster) vid.dataset.lightPoster = vid.getAttribute('poster');
      var want = theme === 'dark' ? vid.dataset.darkPoster : vid.dataset.lightPoster;
      if (vid.getAttribute('poster') !== want) vid.setAttribute('poster', want);
    });
  }
  syncMedia(document.documentElement.dataset.theme);

  var toggle = document.getElementById('theme-toggle');
  toggle.addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('cloche-theme', next);
    syncMedia(next);
  });

  /* ---------- Nav background on scroll ---------- */

  var nav = document.getElementById('nav');
  function onScrollNav() {
    nav.classList.toggle('scrolled', scrollY > 10);
  }
  addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  /* ---------- Hero split-word rise ----------
     Wrap each word in an overflow mask (.w) around an inner span (.wi)
     that starts at translateY(110%) and rises with a 70ms stagger.
     Skipped entirely under reduced motion — the text just renders. */

  if (!reduceMotion) {
    document.querySelectorAll('.split-words').forEach(function (el, blockIndex) {
      var words = el.textContent.trim().split(/\s+/);
      el.textContent = '';
      words.forEach(function (word, i) {
        var mask = document.createElement('span');
        mask.className = 'w';
        var inner = document.createElement('span');
        inner.className = 'wi';
        inner.textContent = word;
        // The subhead block starts after the headline finishes its run
        inner.style.setProperty('--d', (blockIndex * 0.3 + i * 0.07) + 's');
        mask.appendChild(inner);
        el.appendChild(mask);
        el.appendChild(document.createTextNode(' '));
      });
    });
  }

  /* ---------- Scroll reveals ----------
     IntersectionObserver adds .in once; CSS does the blur-up.
     Children of [data-reveal-children] get a 70ms stagger via --d. */

  document.querySelectorAll('[data-reveal-children]').forEach(function (parent) {
    Array.prototype.forEach.call(parent.children, function (child, i) {
      child.style.setProperty('--d', (i * 0.07) + 's');
    });
  });

  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        revealIO.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('[data-reveal], [data-reveal-children]').forEach(function (el) {
    revealIO.observe(el);
  });

  /* ---------- Marquee: clone the group once (hidden from AT) for a seamless -50% loop ---------- */

  var track = document.getElementById('marquee-track');
  var group = track.querySelector('.marquee-group');
  var clone = group.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  track.appendChild(clone);

  /* ---------- Two sides tabs ---------- */

  var tabs = [document.getElementById('tab-work'), document.getElementById('tab-hire')];
  var panels = [document.getElementById('panel-work'), document.getElementById('panel-hire')];
  var swapImgs = document.querySelectorAll('.swap-img');

  function selectTab(index) {
    tabs.forEach(function (tab, i) {
      tab.classList.toggle('is-active', i === index);
      tab.setAttribute('aria-selected', i === index ? 'true' : 'false');
      panels[i].hidden = i !== index;
      panels[i].classList.toggle('is-active', i === index);
      swapImgs[i].classList.toggle('is-active', i === index);
    });
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { selectTab(i); });
    // Left/right arrows move between the two tabs, per the tabs pattern
    tab.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        var next = 1 - i;
        selectTab(next);
        tabs[next].focus();
      }
    });
  });

  /* ---------- Pinned phone: crossfade per copy beat ----------
     Each copy block reports when it crosses the middle band of the
     viewport; the matching screenshot fades in. No scroll math. */

  var beatImgs = document.querySelectorAll('.beat-img');
  var beatIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var index = entry.target.dataset.beat;
      beatImgs.forEach(function (img) {
        img.classList.toggle('is-active', img.dataset.beat === index);
      });
    });
  }, { rootMargin: '-45% 0px -45% 0px' }); // only the middle 10% of the viewport counts

  document.querySelectorAll('.beat').forEach(function (beat) {
    beatIO.observe(beat);
  });

  /* ---------- Cloche video scrub ----------
     The section is 260svh tall; a sticky inner block holds the video.
     Scroll progress through the section maps to video time via rAF.
     Under reduced motion the section is static and the poster shows. */

  var video = document.getElementById('cloche-video');
  var clocheSection = document.getElementById('delight');

  if (!reduceMotion) {
    var scrubActive = false;
    var targetTime = 0;

    // Hand over from the dark poster to the recoloured video only once a frame
    // is actually decodable, so a failed or slow load never shows an inverted
    // poster (see .has-video in styles.css).
    video.addEventListener('loadeddata', function () {
      video.classList.add('has-video');
    });

    // Start fetching the video only when the section is approaching
    var loadIO = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        video.preload = 'auto';
        video.load();
        loadIO.disconnect();
      }
    }, { rootMargin: '150% 0px' });
    loadIO.observe(clocheSection);

    var activeIO = new IntersectionObserver(function (entries) {
      scrubActive = entries[0].isIntersecting;
      if (scrubActive) requestAnimationFrame(scrub);
    });
    activeIO.observe(clocheSection);

    function scrub() {
      if (!scrubActive) return;
      if (video.duration) {
        var rect = clocheSection.getBoundingClientRect();
        // 0 when the section top hits the viewport top, 1 when its bottom leaves
        var progress = -rect.top / (rect.height - innerHeight);
        progress = Math.min(1, Math.max(0, progress));
        targetTime = progress * (video.duration - 0.05);
        // Ease towards the target so seeks stay smooth between keyframes
        video.currentTime += (targetTime - video.currentTime) * 0.25;
      }
      requestAnimationFrame(scrub);
    }
  }

  /* ---------- Count-up stats ---------- */

  var counters = document.querySelectorAll('.count');
  var countIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      countIO.unobserve(entry.target);
      var el = entry.target;
      var end = parseInt(el.dataset.count, 10);
      if (reduceMotion) { el.textContent = end; return; }
      var start = null;
      var duration = 1400;
      function step(ts) {
        if (!start) start = ts;
        var t = Math.min(1, (ts - start) / duration);
        t = 1 - Math.pow(1 - t, 3); // ease-out cubic
        el.textContent = Math.round(end * t);
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });
  counters.forEach(function (el) { countIO.observe(el); });

  /* ---------- Magnetic buttons ----------
     Primary CTAs drift a few pixels towards the cursor. Mouse only. */

  if (!reduceMotion && finePointer) {
    document.querySelectorAll('.magnetic').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) / r.width;
        var dy = (e.clientY - r.top - r.height / 2) / r.height;
        btn.style.transform = 'translate(' + (dx * 6) + 'px,' + (dy * 5) + 'px)';
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.transform = '';
      });
    });
  }

  /* ---------- Card cursor glow ---------- */

  if (finePointer) {
    document.querySelectorAll('.card').forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }
})();
