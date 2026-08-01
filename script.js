/* Cloche — site behaviour. No dependencies.
   Every effect checks prefers-reduced-motion and degrades to static. */

(function () {
  'use strict';

  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = matchMedia('(pointer: fine)').matches;

  /* ---------- Preloader belt-and-braces ----------
     The loader runs from its own inline script (index.html) so it can start
     before this file lands. If that script ever wedges — an error mid-
     choreography, a missed cap — this independent sweeper unsticks the page.
     Normal runs finish well inside the window and this is a no-op. */

  setTimeout(function () {
    var loader = document.getElementById('loader');
    if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
    document.documentElement.classList.remove('is-loading', 'is-arriving');
  }, 6500);

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

  /* ---------- Scroll gallery ----------
     The rail scrolls natively; this only adds the two arrows, drag-with-a-
     mouse, and the disabled states at either end. Nothing here is required
     for the rail to work — with JS off the arrows are hidden (see styles.css)
     and it stays a plain scroller. */

  var rail = document.getElementById('gallery-viewport');
  if (rail) {
    var railPrev = document.getElementById('gallery-prev');
    var railNext = document.getElementById('gallery-next');
    var railCards = rail.querySelectorAll('.gallery-card');

    // Card pitch measured off the DOM rather than hard-coded, so the clamped
    // card width and the gap can change in CSS without touching this.
    function railStep() {
      if (railCards.length < 2) return rail.clientWidth;
      return railCards[1].offsetLeft - railCards[0].offsetLeft;
    }

    function railSync() {
      var max = rail.scrollWidth - rail.clientWidth;
      railPrev.disabled = rail.scrollLeft <= 1;
      railNext.disabled = rail.scrollLeft >= max - 1;
    }

    /* Scroll to an absolute card position rather than by a delta. Deltas drift:
       a half-finished smooth scroll or a drag that stopped between two cards
       compounds into the next press, and the rail slowly loses its alignment
       with the gutter. Snapping to an index can't.

       The index is held here rather than derived from scrollLeft on each press.
       scrollLeft lags a smooth scroll by design, so reading it back meant a
       quick double-press resolved to the same card twice and only ever moved
       one along. A drag re-syncs it once the rail settles. */
    var railIndex = 0;
    var railSettle = 0;

    function railPage(dir) {
      var step = railStep();
      var max = rail.scrollWidth - rail.clientWidth;
      // Clamp in pixels as well as by card: the last card comes to rest short
      // of its own snap position, and an index that ran past it would need
      // several presses of the other arrow before anything visibly moved.
      var left = Math.min(max, Math.max(0, (railIndex + dir) * step));
      railIndex = Math.round(left / step);
      rail.scrollTo({ left: left, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    railPrev.addEventListener('click', function () { railPage(-1); });
    railNext.addEventListener('click', function () { railPage(1); });

    rail.addEventListener('scroll', function () {
      railSync();
      // Once the rail is quiet — end of a drag, a swipe, a wheel — adopt
      // wherever it actually came to rest as the new starting point.
      clearTimeout(railSettle);
      railSettle = setTimeout(function () {
        railIndex = Math.round(rail.scrollLeft / railStep());
      }, 120);
    }, { passive: true });

    /* styles.css loads async (see the media="print" swap in index.html), so
       this file can run while the rail is still an unstyled, unscrollable
       block — measure then and both arrows come up dead. A ResizeObserver
       catches that hand-over along with font swaps, image layout and window
       resizes; the load listener is the fallback where it is missing. */
    if (window.ResizeObserver) {
      var railRO = new ResizeObserver(railSync);
      railRO.observe(rail);
      railRO.observe(rail.querySelector('.gallery-track'));
    } else {
      addEventListener('resize', railSync);
      addEventListener('load', railSync);
    }
    railSync();

    /* Click-and-drag, mouse only — touch already has momentum scrolling and
       pens shouldn't hijack the page. */
    if (finePointer) {
      var dragging = false, dragStartX = 0, dragStartLeft = 0, dragMoved = 0;
      var swallowClick = false;

      /* A drag that ends on a card link would otherwise fire a click and
         navigate. This eats exactly one click, and only when the pointer
         actually travelled — a plain click must still follow its link. The
         flag is cleared on the next press, so a drag that ends over nothing
         (no click to eat) can't leave a trap armed for later. */
      rail.addEventListener('click', function (e) {
        if (!swallowClick) return;
        swallowClick = false;
        e.preventDefault();
        e.stopPropagation();
      }, true);

      rail.addEventListener('pointerdown', function (e) {
        swallowClick = false;
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        dragging = true;
        dragMoved = 0;
        dragStartX = e.clientX;
        dragStartLeft = rail.scrollLeft;
        rail.setPointerCapture(e.pointerId);
        rail.classList.add('is-dragging');
      });

      rail.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - dragStartX;
        dragMoved = Math.max(dragMoved, Math.abs(dx));
        rail.scrollLeft = dragStartLeft - dx;
      });

      function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        rail.classList.remove('is-dragging'); // snapping re-engages here
        if (rail.hasPointerCapture(e.pointerId)) rail.releasePointerCapture(e.pointerId);
        swallowClick = dragMoved > 5;
      }
      rail.addEventListener('pointerup', endDrag);
      rail.addEventListener('pointercancel', endDrag);
    }
  }

  /* ---------- Hero side toggle ----------
     The one interactive work/hire switch on the page (#sides is static copy).
     The tabpanels are the screenshots themselves; the crossfade plus a quick
     cloche beat make the flip read as the feed re-refreshing. */

  var tabs = [document.getElementById('tab-work'), document.getElementById('tab-hire')];
  var swapImgs = document.querySelectorAll('.swap-img');
  var screenCloche = document.getElementById('screen-cloche');
  var beatRaf = 0;

  function refreshBeat() {
    // Short and purely decorative — it never blocks the crossfade or input
    if (reduceMotion || !screenCloche) return;
    cancelAnimationFrame(beatRaf);
    var FRAMES = 36, COLS = 6, DURATION = 520;
    var start = performance.now();
    screenCloche.classList.add('is-on');
    (function step(now) {
      var t = Math.min(1, (now - start) / DURATION);
      // Closed to open — the arc a real refresh takes: the mark arms on the
      // plain dome and resolves into the hand, then clears (pull-indicator.tsx).
      var p = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // in-out quad
      var i = Math.round(p * (FRAMES - 1));
      screenCloche.style.backgroundPosition = ((i % COLS) * 20) + '% ' + (((i / COLS) | 0) * 20) + '%';
      if (t < 1) beatRaf = requestAnimationFrame(step);
      else screenCloche.classList.remove('is-on');
    })(start);
  }

  function selectTab(index) {
    tabs.forEach(function (tab, i) {
      tab.classList.toggle('is-active', i === index);
      tab.setAttribute('aria-selected', i === index ? 'true' : 'false');
      swapImgs[i].classList.toggle('is-active', i === index);
    });
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () {
      if (tab.classList.contains('is-active')) return;
      selectTab(i);
      refreshBeat();
    });
    // Left/right arrows move between the two tabs, per the tabs pattern
    tab.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        var next = 1 - i;
        selectTab(next);
        refreshBeat();
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

  /* ---------- Full-screen map: pins land on scroll ----------
     The bare map covers the viewport; scroll progress through the tall
     .mapscroll section rains the pins onto it, smallest counts first, the
     CBD's 37 last. Every pin is a pure function of scroll position — scrub
     back up and they lift off in reverse order. The summary chip counts
     along with them. */

  var mapSection = document.getElementById('map');
  if (mapSection) {
    var mapStage = document.getElementById('map-stage');
    var mapTitles = document.getElementById('map-titles');
    var mapChip = document.getElementById('map-chip');
    var chipJobs = document.getElementById('map-chip-jobs');
    var chipSuburbs = document.getElementById('map-chip-suburbs');

    /* [x%, y%, jobs] — the tip of each teardrop on the base image. Positions
       were measured off the app's own map screenshot (assets/02-map.png) and
       registered onto the clean simulator capture the base is cut from
       (SIFT + RANSAC similarity fit, 942 inliers), so every pin sits on its
       real suburb. The visible pins sum to 222; the app's headline numbers
       are 314 jobs / 48 suburbs (some pins sit behind others), so the chip
       scales up to land on those. */
    var PIN_DATA = [
      [44.52, 25.84, 3], [56.49, 25.84, 6], [78.22, 25.84, 9],
      [45.61, 32.28, 3], [49.91, 32.28, 3], [60.27, 31.57, 6],
      [64.74, 32.28, 5], [69.80, 31.34, 3], [36.51, 34.77, 8],
      [35.75, 37.95, 4], [56.32, 36.54, 5], [45.28, 38.19, 6],
      [62.47, 38.49, 37], [66.51, 38.61, 8], [64.83, 40.50, 14],
      [74.69, 38.84, 4], [69.63, 39.91, 5], [51.09, 41.32, 6],
      [44.69, 42.21, 5], [75.86, 42.57, 5], [56.06, 43.86, 13],
      [59.52, 45.40, 8], [73.84, 44.69, 4], [51.00, 46.05, 11],
      [69.54, 46.58, 10], [25.81, 47.41, 2], [58.00, 49.42, 9],
      [44.77, 52.96, 6], [50.25, 54.67, 6], [39.88, 56.03, 7],
      [70.30, 58.40, 1]
    ];
    var JOBS_TOTAL = 314, SUBURBS_TOTAL = 48;

    // The app's pin ramp, green through to deep red, sampled off its markers
    var RAMP = [
      [1, [119, 206, 125]], [3, [143, 193, 85]], [5, [179, 188, 78]],
      [6, [207, 180, 74]], [8, [221, 144, 54]], [10, [219, 119, 46]],
      [13, [201, 78, 40]], [16, [185, 49, 34]], [37, [158, 27, 27]]
    ];
    function pinColour(n) {
      var i = 1;
      while (i < RAMP.length - 1 && RAMP[i][0] < n) i++;
      var a = RAMP[i - 1], b = RAMP[i];
      var t = Math.min(1, Math.max(0, (n - a[0]) / (b[0] - a[0])));
      function ch(k) { return Math.round(a[1][k] + (b[1][k] - a[1][k]) * t); }
      return 'rgb(' + ch(0) + ',' + ch(1) + ',' + ch(2) + ')';
    }

    // Land order: small counts first, the 37 as the closing beat.
    // North-to-south inside a tie so equal pins sweep down the map.
    var pinOrder = PIN_DATA.slice().sort(function (a, b) {
      return (a[2] - b[2]) || (a[1] - b[1]);
    });

    var visibleSum = 0;
    pinOrder.forEach(function (p) { visibleSum += p[2]; });

    var mapPins = pinOrder.map(function (p) {
      var el = document.createElement('div');
      el.className = 'map-pin';
      // Sized by count like the app. Scaled to the clean capture's camera,
      // which sits ~0.78x the old screenshot's zoom: ~5.3% for a 1 up to ~8%.
      var w = 5.3 + Math.min(p[2], 20) / 20 * 2.7;
      el.style.left = p[0] + '%';
      el.style.top = p[1] + '%';
      el.style.width = w + '%';
      el.style.zIndex = 10 + p[2]; // busier pins sit on top, as in the app
      var fs = p[2] > 9 ? 22 : 25;
      el.innerHTML =
        '<div class="pin-fall">' +
          '<svg viewBox="0 0 64 84" aria-hidden="true">' +
            '<path d="M32 80C27 63 8 52 8 32a24 24 0 1 1 48 0c0 20-19 31-24 48Z" fill="' + pinColour(p[2]) + '" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/>' +
            '<text x="32" y="' + (32 + fs * 0.36) + '" text-anchor="middle" font-family="Inter Tight, Inter, system-ui, sans-serif" font-weight="700" font-size="' + fs + '" fill="#141414">' + p[2] + '</text>' +
          '</svg>' +
        '</div>';
      mapStage.appendChild(el);
      return { jobs: p[2], fall: el.firstChild, lastT: -1 };
    });

    /* Frame the map. Portrait viewports cover edge-to-edge like the app and
       this is a no-op (the clamp pins the offset to 0). Landscape viewports
       would otherwise centre-crop an image ~2.4x their height and lose the
       top rows of pins — so slide the stage until the pin band's centre
       (34.5% down the image, the transform-origin above) sits just below the
       viewport's middle, clamped so an edge never pulls into view. */
    function mapFrame(zoom) {
      var h = mapStage.offsetHeight;
      var o = Math.min(0, Math.max(innerHeight - h, innerHeight * 0.53 - 0.39 * h));
      mapStage.style.transform =
        'translateX(-50%) translateY(' + o + 'px) scale(' + zoom + ')';
    }

    if (reduceMotion) {
      // Static finished state: pins land by default, the chip just shows.
      mapChip.classList.add('is-on');
      mapFrame(1);
      addEventListener('resize', function () { mapFrame(1); });
    } else {
      /* Each pin owns a slice of the scrub: [start, start + LAND] of section
         progress, staggered across the landing window. DROP is the fall
         height in pin-heights — far enough to clearly come "from above",
         near enough that the tip reads as aimed at its suburb throughout. */
      var LAND = 0.16, FIRST = 0.06, LAST = 0.82;
      var DROP = 320;
      var pitch = (LAST - LAND - FIRST) / Math.max(1, mapPins.length - 1);
      mapPins.forEach(function (pin, i) {
        pin.start = FIRST + pitch * i;
        pin.fall.style.opacity = '0';
        pin.fall.style.transform = 'translateY(-' + DROP + '%)';
      });
      /* Hide the titles up front rather than waiting for the first scrub
         frame: the observer fires a beat after the section starts intersecting,
         and until then the CSS default would show them fully formed — exactly
         the state they are supposed to arrive at. */
      mapTitles.style.opacity = '0';

      var easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };

      var mapLastP = -1;
      function mapApply(p) {
        // Slight settle-out of an opening zoom gives the map itself a drift
        mapFrame(1.05 - 0.05 * easeOutCubic(p));

        /* The map arrives bare for a beat, then the titles rise in as the
           first pins start landing — early enough that the section reads as
           labelled almost immediately, and they hold for the rest of the
           scrub. The track is only ~55svh, so a window this short is still
           several hundred pixels of scrolling. */
        var titleIn = Math.max(0, Math.min(1, (p - 0.04) / 0.16));
        mapTitles.style.opacity = titleIn.toFixed(3);
        mapTitles.style.transform = 'translateY(' + ((1 - titleIn) * 18).toFixed(1) + 'px)';

        var landedJobs = 0, landedPins = 0;
        mapPins.forEach(function (pin) {
          var t = Math.min(1, Math.max(0, (p - pin.start) / LAND));
          if (t >= 1) { landedJobs += pin.jobs; landedPins++; }
          if (t === pin.lastT) return; // parked pins cost nothing
          pin.lastT = t;
          var e = easeOutCubic(t);
          // Decelerating fall — the pin sets down on its suburb, no bounce
          pin.fall.style.transform = 'translateY(-' + ((1 - e) * DROP) + '%)';
          pin.fall.style.opacity = Math.min(1, t / 0.22).toFixed(3);
        });

        mapChip.classList.toggle('is-on', p > 0.04);
        chipJobs.textContent = Math.round(JOBS_TOTAL * landedJobs / visibleSum);
        chipSuburbs.textContent = Math.round(SUBURBS_TOTAL * landedPins / mapPins.length);
      }

      var mapActive = false;
      function mapScrub() {
        if (!mapActive) return;
        var rect = mapSection.getBoundingClientRect();
        var p = -rect.top / (rect.height - innerHeight);
        p = Math.min(1, Math.max(0, p));
        if (p !== mapLastP) { mapLastP = p; mapApply(p); }
        requestAnimationFrame(mapScrub);
      }
      var mapIO = new IntersectionObserver(function (entries) {
        mapActive = entries[0].isIntersecting;
        if (mapActive) requestAnimationFrame(mapScrub);
      });
      mapIO.observe(mapSection);
      // A resize moves the framing even at the same scroll position
      addEventListener('resize', function () { mapLastP = -1; });
    }
  }

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

/* ---------- Hero ambient background ----------
   A WebGL radiance centred on the phone: layered fbm noise drifts slowly
   outward from the device, so the light reads as silk flowing off it —
   no edges, no geometry, just glow dissolving into the page. Rendered
   premultiplied over a transparent canvas, so the same shader works on
   both themes (mint wash on white, luminous green on black). Pauses when
   the hero is off-screen or the tab is hidden; renders a single static
   frame under reduced motion; survives context loss (mobile Safari
   evicts WebGL contexts under first-load memory pressure). If WebGL is
   unavailable the canvas's CSS gradient fallback simply stays. */
(function () {
  'use strict';

  var canvas = document.getElementById('hero-ambient');
  if (!canvas) return;

  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Per-fragment cost is what decides whether this holds 60fps on a phone,
     and the image is nothing but soft gradients — a slightly under-sampled
     buffer stretched back up is indistinguishable. Cap the device ratio, then
     cap total pixels as well, so a big desktop window and a dense phone
     screen both land inside the same fill-rate budget. `scale` is recomputed
     on every resize; it is the only px conversion the shader path uses. */
  var PIXEL_BUDGET = 1.15e6;
  var scale = 1;
  function measure() {
    var cw = Math.max(canvas.clientWidth, 1), ch = Math.max(canvas.clientHeight, 1);
    var s = Math.min(devicePixelRatio || 1, 1.75);
    var px = cw * ch * s * s;
    if (px > PIXEL_BUDGET) s *= Math.sqrt(PIXEL_BUDGET / px);
    scale = Math.max(s, 0.6);
  }
  measure();

  var VERT = [
    'attribute vec3 position;',
    'void main() { gl_Position = vec4(position, 1.0); }',
  ].join('\n');

  /* Everything is in phone-heights: p is the fragment's offset from the
     phone centre, 1.0 = one phone-height away. Two ray fields advect
     radially outward at different rates; each ray is born at the phone's
     silhouette and burns out as it travels. */
  var FRAG = [
    'precision highp float;',
    'uniform vec2 resolution;',
    'uniform float time;',
    'uniform vec2 focus;',      // phone centre, device pixels, GL origin
    'uniform float span;',      // phone height, device pixels
    'uniform float ratio;',     // phone width / phone height
    'uniform vec3 tintIn;',
    'uniform vec3 tintOut;',
    'uniform float strength;',
    'uniform float reach;',     // gaussian falloff coefficient
    'uniform float base;',      // flat glow under the veils
    'uniform float veil;',      // how hard the noise texture reads
    'uniform float fill;',      // how much of the flat glow survives (see JS)
    '',
    // The noise is tileable on demand: hashing the wrapped lattice cell makes
    // the field exactly periodic, which buys two things. Angularly it closes
    // the circle with no seam and no sample-averaging (see below). Radially it
    // lets the outward flow offset wrap with mod() instead of counting up
    // forever, so the hash never sees the large coordinates where sin() loses
    // its precision and the texture goes blotchy after a few minutes.
    'float phash(vec2 p, vec2 per) {',
    '  p = mod(p, per);',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
    '}',
    'float pnoise(vec2 p, vec2 per) {',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(phash(i, per),                  phash(i + vec2(1.0, 0.0), per), u.x),',
    '             mix(phash(i + vec2(0.0, 1.0), per), phash(i + vec2(1.0, 1.0), per), u.x), u.y);',
    '}',
    // Octaves double the frequency, so the period doubles with them and every
    // octave stays in register. (Constant offsets are free — a shift by a whole
    // period still lands on the same wrapped cell.)
    'float pfbm(vec2 p, vec2 per) {',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  for (int i = 0; i < 3; i++) {',
    '    v += a * pnoise(p, per);',
    '    p = p * 2.0 + vec2(11.7, 5.3);',
    '    per *= 2.0;',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    '',
    'const float RPER = 16.0;',  // radial period, in noise units
    '',
    'void main() {',
    '  vec2 p = (gl_FragCoord.xy - focus) / span;',
    '  float r = length(p);',
    '  float ang = atan(p.y, p.x) * 0.1591549 + 0.5;',  // 0..1 around the phone
    '',
    '  // Rays of light streaming out of the phone, sampled in LOG-polar space.',
    '  // Plain polar makes rays that dissolve into blobs on their way out: the',
    '  // arc a noise cell covers grows with the radius while its radial length',
    '  // does not, so a wedge near the phone is a lump by the time it is two',
    '  // phone-heights away. Against log(r) both dimensions scale together, so',
    '  // a ray keeps its shape for its whole life and simply widens the way',
    '  // light actually does. Translating that axis is a multiply in world',
    '  // space, which is also why the rays visibly pick up speed as they go.',
    '  //',
    '  // Two fields at different angular frequencies, combined with max(): where',
    '  // one is between rays the other is usually mid-ray, so no sector of the',
    '  // circle can go bald while the pattern still reads as random. (The old',
    '  // single field blended two samples across the seam, which averaged the',
    '  // contrast away at exactly one angle — the phone\'s right-hand side —',
    '  // and left it permanently dim. Periodic noise has no seam to hide.)',
    '  float lr = log(max(r, 0.18));',
    '  // Cell aspect is what decides ray-versus-blob: an angular cell covers',
    '  // 2*PI/N radians, a radial one a factor exp(1/k) in radius, and the two',
    '  // want to sit around 6:1. N up / k down makes them finer and longer.',
    '  float fA = pfbm(vec2(ang * 30.0, lr * 1.15 - mod(time * 0.290, RPER)), vec2(30.0, RPER));',
    '  float fB = pfbm(vec2(ang * 19.0, lr * 0.95 - mod(time * 0.210, RPER) + 5.0), vec2(19.0, RPER));',
    '  float streak = pow(smoothstep(0.47, 0.80, max(fA, fB * 0.96)), 1.35);',
    '',
    '  // a soft slow cloud underneath keeps the rays from feeling clinical',
    '  float cl = smoothstep(0.34, 0.80, pnoise(p * 1.6 + vec2(mod(time * 0.05, 32.0), mod(time * 0.037, 32.0)), vec2(32.0)));',
    '',
    '  // Because the field only translates outward, a ray\'s age IS its radius:',
    '  // one envelope in r therefore gives every ray the same life story. It',
    '  // clears the phone\'s silhouette (an ellipse on the real device aspect,',
    '  // so rays leave the sides and the ends alike), then dissipates well',
    '  // before the page edge instead of streaking off it.',
    '  float halo = exp(-r * r * reach);',
    '  // The ramp is deliberately short. Measured off the silhouette it looks',
    '  // generous, but the ellipse is narrow, so a wide ramp spends its whole',
    '  // length within a few dozen px of the phone\'s left and right edges —',
    '  // on a handset that is the entire margin, and the sides read as bald',
    '  // while the top and bottom blaze. Full strength by 1.3x clears it.',
    '  float born = smoothstep(0.96, 1.30, length(vec2(p.x / max(ratio * 0.5, 0.08), p.y * 2.0)));',
    '  float life = born * exp(-r * r * reach * 2.3);',
    '',
    '  // soft-knee instead of a hard clamp: dense noise phases compress',
    '  // toward the ceiling rather than saturating, so overall intensity',
    '  // stays level while the texture inside keeps moving',
    '  float x = (fill * (base + veil * 0.11 * cl) * halo + veil * streak * life) * strength;',
    '  float a = 1.0 - exp(-x * 1.35);',
    '  vec3 col = mix(tintIn, tintOut, clamp(r * 0.7, 0.0, 1.0));',
    '  gl_FragColor = vec4(col * a, a);', // premultiplied
    '}',
  ].join('\n');

  /* Same green, two voices: deeper tones carry on white, brighter ones
     glow on black. Values are 0-1 RGB for the shader. */
  function palette(theme) {
    var dark = theme === 'dark';
    return dark ? {
      tintIn: [0.4, 0.92, 0.64],    // luminous mint
      tintOut: [0.12, 0.56, 0.31],  // deep brand green
      strength: 1.0,
      reach: 0.6, base: 0.13, veil: 1.15,
    } : {
      /* On white the light must be darker than the page or it vanishes:
         deep brand greens, and almost no flat base so what reads is the ray
         texture rather than a uniform tint. The rays carry roughly twice the
         amplitude they do on black — a mid green at 40% over white is a much
         quieter mark than the same green at 40% over near-black. */
      tintIn: [0.07, 0.45, 0.24],   // deep brand green, darker than the page
      tintOut: [0.24, 0.63, 0.4],   // mid green, never pale mint
      strength: 1.15,
      reach: 0.62, base: 0.085, veil: 1.15,
    };
  }
  var pal = palette(document.documentElement.dataset.theme);
  new MutationObserver(function () {
    pal = palette(document.documentElement.dataset.theme);
    if (reduceMotion || rafId === null) draw(); // animated frames pick it up anyway
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* The light is anchored to the phone. Measure it every frame — two
     getBoundingClientRect calls are nothing, and it means fonts, layout
     shifts and breakpoint changes can never leave the glow misaligned. */
  var device = document.querySelector('.hero-device .device');
  function focusSpan() {
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!device) return { x: cw * 0.72 * scale, y: ch * 0.5 * scale, s: ch * 0.55 * scale, k: 0.46, f: 1 };
    var dr = device.getBoundingClientRect();
    var cr = canvas.getBoundingClientRect();
    var h = Math.max(dr.height, 1);
    return {
      x: (dr.left + dr.width / 2 - cr.left) * scale,
      // gl_FragCoord's origin is the bottom-left corner
      y: (cr.height - (dr.top + dr.height / 2 - cr.top)) * scale,
      s: h * scale,
      k: dr.width / h,
      // On a phone the device is most of the viewport's width, so the only
      // light with room to be seen is the near field — and there the flat
      // glow simply floods it, turning the rays into one soft wash. Stand the
      // fill down as the margin around the phone closes up; the rays are
      // untouched, so what little room there is goes to them.
      f: Math.min(1, Math.max(0.55, cr.width / 2 / h)),
    };
  }

  var gl = null;
  var uResolution, uTime, uFocus, uSpan, uRatio, uTintIn, uTintOut, uStrength, uReach, uBase, uVeil, uFill;
  // A pure translation of a periodic field: every frame is as developed as
  // every other, so the first one already shows full-grown rays and there is
  // nothing to wait for. Start at a random phase so each visit plays a
  // different stretch; the shader wraps it, so it can run all day.
  var time = Math.random() * 600;
  var rafId = null;
  var inView = true;
  var last = performance.now();

  function fail() {
    canvas.style.display = 'none'; // CSS gradient fallback takes over
  }

  /* Create the context and (re)build all GL state. Runs once at boot and
     again after webglcontextrestored, so nothing may leak between runs. */
  function initGL() {
    gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true })
      || canvas.getContext('experimental-webgl', { alpha: true });
    if (!gl || gl.isContextLost()) return false;

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }

    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;

    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    // Fullscreen quad (two triangles)
    var positions = new Float32Array([
      -1, -1, 0, 1, -1, 0, -1, 1, 0,
      1, -1, 0, -1, 1, 0, 1, 1, 0,
    ]);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    var posLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    uResolution = gl.getUniformLocation(program, 'resolution');
    uTime = gl.getUniformLocation(program, 'time');
    uFocus = gl.getUniformLocation(program, 'focus');
    uSpan = gl.getUniformLocation(program, 'span');
    uRatio = gl.getUniformLocation(program, 'ratio');
    uTintIn = gl.getUniformLocation(program, 'tintIn');
    uTintOut = gl.getUniformLocation(program, 'tintOut');
    uStrength = gl.getUniformLocation(program, 'strength');
    uReach = gl.getUniformLocation(program, 'reach');
    uBase = gl.getUniformLocation(program, 'base');
    uVeil = gl.getUniformLocation(program, 'veil');
    uFill = gl.getUniformLocation(program, 'fill');

    resize(true);
    return true;
  }

  function resize(force) {
    if (!gl) return;
    measure();
    var w = Math.max(1, Math.floor(canvas.clientWidth * scale));
    var h = Math.max(1, Math.floor(canvas.clientHeight * scale));
    if (force || canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2fv(uResolution, [w, h]);
    }
  }

  function draw() {
    if (!gl || gl.isContextLost()) return;
    var f = focusSpan();
    gl.uniform1f(uTime, time);
    gl.uniform2fv(uFocus, [f.x, f.y]);
    gl.uniform1f(uSpan, f.s);
    gl.uniform1f(uRatio, f.k);
    gl.uniform3fv(uTintIn, pal.tintIn);
    gl.uniform3fv(uTintOut, pal.tintOut);
    gl.uniform1f(uStrength, pal.strength);
    gl.uniform1f(uReach, pal.reach);
    gl.uniform1f(uBase, pal.base);
    gl.uniform1f(uVeil, pal.veil);
    gl.uniform1f(uFill, f.f);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /* One rate, always. The rays are already developed on frame one, so there
     is nothing to fast-forward through — and an opening burst that eases back
     down is the one thing you can actually see in a field like this: it reads
     as the animation slowing to a halt rather than settling in. Clamp the step
     so a stalled tab or a dropped frame can't jump the flow forward. */
  function frame(now) {
    time += Math.min(0.05, (now - last) / 1000);
    last = now;
    draw();
    rafId = requestAnimationFrame(frame);
  }
  function play() {
    if (rafId === null && !reduceMotion) {
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  }
  function pause() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  if (!initGL()) { fail(); return; }
  canvas.style.background = 'none'; // shader owns the pixels; drop the CSS wash
  draw(); // always paint at least one frame

  /* Mobile Safari (and low-memory devices generally) may evict the context
     during a heavy first load. Recover instead of staying blank forever. */
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault(); // opt in to restoration
    pause();
  });
  canvas.addEventListener('webglcontextrestored', function () {
    if (initGL()) {
      draw();
      if (!reduceMotion && inView && !document.hidden) play();
    } else {
      fail();
    }
  });

  // Track the element itself, not just the window: fonts and the loader
  // handoff shift the hero's height after boot, which would leave a stale buffer.
  if ('ResizeObserver' in window) {
    new ResizeObserver(function () { resize(); draw(); }).observe(canvas);
  }
  addEventListener('resize', function () { resize(); draw(); });

  if (reduceMotion) return; // static veils, no motion

  // Save GPU/battery when the hero is scrolled away or the tab is hidden
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView && !document.hidden) play(); else pause();
    }, { threshold: 0 }).observe(canvas);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause(); else if (inView) play();
  });

  play();
})();
