
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    // Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
    // at the end of hydration without touching the remaining nodes.
    let is_hydrating = false;
    function start_hydrating() {
        is_hydrating = true;
    }
    function end_hydrating() {
        is_hydrating = false;
    }
    function upper_bound(low, high, key, value) {
        // Return first index of value larger than input value in the range [low, high)
        while (low < high) {
            const mid = low + ((high - low) >> 1);
            if (key(mid) <= value) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }
        return low;
    }
    function init_hydrate(target) {
        if (target.hydrate_init)
            return;
        target.hydrate_init = true;
        // We know that all children have claim_order values since the unclaimed have been detached
        const children = target.childNodes;
        /*
        * Reorder claimed children optimally.
        * We can reorder claimed children optimally by finding the longest subsequence of
        * nodes that are already claimed in order and only moving the rest. The longest
        * subsequence subsequence of nodes that are claimed in order can be found by
        * computing the longest increasing subsequence of .claim_order values.
        *
        * This algorithm is optimal in generating the least amount of reorder operations
        * possible.
        *
        * Proof:
        * We know that, given a set of reordering operations, the nodes that do not move
        * always form an increasing subsequence, since they do not move among each other
        * meaning that they must be already ordered among each other. Thus, the maximal
        * set of nodes that do not move form a longest increasing subsequence.
        */
        // Compute longest increasing subsequence
        // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
        const m = new Int32Array(children.length + 1);
        // Predecessor indices + 1
        const p = new Int32Array(children.length);
        m[0] = -1;
        let longest = 0;
        for (let i = 0; i < children.length; i++) {
            const current = children[i].claim_order;
            // Find the largest subsequence length such that it ends in a value less than our current value
            // upper_bound returns first greater value, so we subtract one
            const seqLen = upper_bound(1, longest + 1, idx => children[m[idx]].claim_order, current) - 1;
            p[i] = m[seqLen] + 1;
            const newLen = seqLen + 1;
            // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
            m[newLen] = i;
            longest = Math.max(newLen, longest);
        }
        // The longest increasing subsequence of nodes (initially reversed)
        const lis = [];
        // The rest of the nodes, nodes that will be moved
        const toMove = [];
        let last = children.length - 1;
        for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
            lis.push(children[cur - 1]);
            for (; last >= cur; last--) {
                toMove.push(children[last]);
            }
            last--;
        }
        for (; last >= 0; last--) {
            toMove.push(children[last]);
        }
        lis.reverse();
        // We sort the nodes being moved to guarantee that their insertion order matches the claim order
        toMove.sort((a, b) => a.claim_order - b.claim_order);
        // Finally, we move the nodes
        for (let i = 0, j = 0; i < toMove.length; i++) {
            while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
                j++;
            }
            const anchor = j < lis.length ? lis[j] : null;
            target.insertBefore(toMove[i], anchor);
        }
    }
    function append(target, node) {
        if (is_hydrating) {
            init_hydrate(target);
            if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentElement !== target))) {
                target.actual_end_child = target.firstChild;
            }
            if (node !== target.actual_end_child) {
                target.insertBefore(node, target.actual_end_child);
            }
            else {
                target.actual_end_child = node.nextSibling;
            }
        }
        else if (node.parentNode !== target) {
            target.appendChild(node);
        }
    }
    function insert(target, node, anchor) {
        if (is_hydrating && !anchor) {
            append(target, node);
        }
        else if (node.parentNode !== target || node.nextSibling != anchor) {
            target.insertBefore(node, anchor || null);
        }
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail, bubbles = false) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = (program.b - t);
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program || pending_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                start_hydrating();
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            end_hydrating();
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* src\lib\Refresh.svelte generated by Svelte v3.39.0 */

    function create_fragment$9(ctx) {
    	let h1;
    	let t1;
    	let div;
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Frames";
    			t1 = space();
    			div = element("div");
    			button = element("button");
    			button.textContent = "Refresh";
    			attr(h1, "class", "svelte-1u93ogr");
    			attr(div, "class", "center svelte-1u93ogr");
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			insert(target, div, anchor);
    			append(div, button);

    			if (!mounted) {
    				dispose = listen(button, "click", /*refreshPage*/ ctx[0]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);
    			if (detaching) detach(div);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$8($$self) {
    	const refreshPage = () => {
    		window.location.href = '/';
    	};

    	return [refreshPage];
    }

    class Refresh extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$8, create_fragment$9, safe_not_equal, {});
    	}
    }

    /* src\lib\FrameIcon.svelte generated by Svelte v3.39.0 */

    function create_fragment$8(ctx) {
    	let div2;

    	return {
    		c() {
    			div2 = element("div");
    			div2.innerHTML = `<div class="big svelte-ihoour"><div class="small svelte-ihoour"></div></div>`;
    			attr(div2, "class", "center svelte-ihoour");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div2);
    		}
    	};
    }

    class FrameIcon extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$8, safe_not_equal, {});
    	}
    }

    function fade(node, { delay = 0, duration = 400, easing = identity } = {}) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    const currentFrameID = writable("001");

    const FRAMEID = writable(undefined);

    /* src\lib\FrameDetected.svelte generated by Svelte v3.39.0 */

    function create_fragment$7(ctx) {
    	let div0;
    	let t0;
    	let div1;
    	let h20;
    	let t2;
    	let frameicon;
    	let t3;
    	let h21;
    	let t4;
    	let t5;
    	let t6;
    	let button;
    	let div1_transition;
    	let current;
    	let mounted;
    	let dispose;
    	frameicon = new FrameIcon({});

    	return {
    		c() {
    			div0 = element("div");
    			t0 = space();
    			div1 = element("div");
    			h20 = element("h2");
    			h20.textContent = "New Frame Detected!";
    			t2 = space();
    			create_component(frameicon.$$.fragment);
    			t3 = space();
    			h21 = element("h2");
    			t4 = text("#");
    			t5 = text(/*$FRAMEID*/ ctx[0]);
    			t6 = space();
    			button = element("button");
    			button.textContent = "Close";
    			attr(div0, "class", "blackout svelte-1ebz6b2");
    			attr(h20, "class", "svelte-1ebz6b2");
    			set_style(h21, "color", "#BABABA");
    			attr(h21, "class", "svelte-1ebz6b2");
    			attr(button, "class", "svelte-1ebz6b2");
    			attr(div1, "class", "bg svelte-1ebz6b2");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t0, anchor);
    			insert(target, div1, anchor);
    			append(div1, h20);
    			append(div1, t2);
    			mount_component(frameicon, div1, null);
    			append(div1, t3);
    			append(div1, h21);
    			append(h21, t4);
    			append(h21, t5);
    			append(div1, t6);
    			append(div1, button);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*closePopup*/ ctx[1]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*$FRAMEID*/ 1) set_data(t5, /*$FRAMEID*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(frameicon.$$.fragment, local);

    			add_render_callback(() => {
    				if (!div1_transition) div1_transition = create_bidirectional_transition(div1, fade, { duration: 200 }, true);
    				div1_transition.run(1);
    			});

    			current = true;
    		},
    		o(local) {
    			transition_out(frameicon.$$.fragment, local);
    			if (!div1_transition) div1_transition = create_bidirectional_transition(div1, fade, { duration: 200 }, false);
    			div1_transition.run(0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t0);
    			if (detaching) detach(div1);
    			destroy_component(frameicon);
    			if (detaching && div1_transition) div1_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let $FRAMEID;
    	component_subscribe($$self, FRAMEID, $$value => $$invalidate(0, $FRAMEID = $$value));
    	let { showFrameDetected } = $$props;

    	const closePopup = () => {
    		$$invalidate(2, showFrameDetected = false);
    	};

    	$$self.$$set = $$props => {
    		if ('showFrameDetected' in $$props) $$invalidate(2, showFrameDetected = $$props.showFrameDetected);
    	};

    	return [$FRAMEID, closePopup, showFrameDetected];
    }

    class FrameDetected extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { showFrameDetected: 2 });
    	}
    }

    /* src\lib\HomeFrame.svelte generated by Svelte v3.39.0 */

    function create_else_block$3(ctx) {
    	let div1;

    	return {
    		c() {
    			div1 = element("div");
    			div1.innerHTML = `<div class="small svelte-gc3fbo"></div>`;
    			attr(div1, "class", "big svelte-gc3fbo");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    		}
    	};
    }

    // (22:42) 
    function create_if_block_2$1(ctx) {
    	let div1;

    	return {
    		c() {
    			div1 = element("div");
    			div1.innerHTML = `<div class="small svelte-gc3fbo"></div>`;
    			attr(div1, "class", "big svelte-gc3fbo");
    			set_style(div1, "background", "#E9CA5D");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    		}
    	};
    }

    // (18:70) 
    function create_if_block_1$3(ctx) {
    	let div1;

    	return {
    		c() {
    			div1 = element("div");
    			div1.innerHTML = `<div class="small svelte-gc3fbo"></div>`;
    			attr(div1, "class", "big svelte-gc3fbo");
    			set_style(div1, "outline", "4px solid #5D6AE8");
    			set_style(div1, "background", "#E9CA5D");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    		}
    	};
    }

    // (14:4) {#if frameData.id == $FRAMEID && frameData.videoFile == null}
    function create_if_block$4(ctx) {
    	let div1;

    	return {
    		c() {
    			div1 = element("div");
    			div1.innerHTML = `<div class="small svelte-gc3fbo"></div>`;
    			attr(div1, "class", "big svelte-gc3fbo");
    			set_style(div1, "outline", "4px solid #5D6AE8");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	let div;
    	let t0;
    	let h3;
    	let t1;
    	let t2_value = /*frameData*/ ctx[0].id + "";
    	let t2;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*frameData*/ ctx[0].id == /*$FRAMEID*/ ctx[1] && /*frameData*/ ctx[0].videoFile == null) return create_if_block$4;
    		if (/*frameData*/ ctx[0].id == /*$FRAMEID*/ ctx[1] && /*frameData*/ ctx[0].videoFile != null) return create_if_block_1$3;
    		if (/*frameData*/ ctx[0].videoFile != null) return create_if_block_2$1;
    		return create_else_block$3;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			div = element("div");
    			if_block.c();
    			t0 = space();
    			h3 = element("h3");
    			t1 = text("#");
    			t2 = text(t2_value);
    			attr(h3, "class", "svelte-gc3fbo");
    			attr(div, "class", "frameObject svelte-gc3fbo");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if_block.m(div, null);
    			append(div, t0);
    			append(div, h3);
    			append(h3, t1);
    			append(h3, t2);

    			if (!mounted) {
    				dispose = listen(div, "click", /*clickedFrame*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div, t0);
    				}
    			}

    			if (dirty & /*frameData*/ 1 && t2_value !== (t2_value = /*frameData*/ ctx[0].id + "")) set_data(t2, t2_value);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let $FRAMEID;
    	component_subscribe($$self, FRAMEID, $$value => $$invalidate(1, $FRAMEID = $$value));
    	let { frameData } = $$props;
    	let { showRecordPage } = $$props;

    	const clickedFrame = () => {
    		currentFrameID.set(frameData.id);
    		$$invalidate(3, showRecordPage = true);
    		console.log(frameData.id);
    	};

    	$$self.$$set = $$props => {
    		if ('frameData' in $$props) $$invalidate(0, frameData = $$props.frameData);
    		if ('showRecordPage' in $$props) $$invalidate(3, showRecordPage = $$props.showRecordPage);
    	};

    	return [frameData, $FRAMEID, clickedFrame, showRecordPage];
    }

    class HomeFrame extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { frameData: 0, showRecordPage: 3 });
    	}
    }

    /* src\lib\FrameCollection.svelte generated by Svelte v3.39.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    // (10:4) {#each FramesData as frameData}
    function create_each_block(ctx) {
    	let homeframe;
    	let updating_showRecordPage;
    	let current;

    	function homeframe_showRecordPage_binding(value) {
    		/*homeframe_showRecordPage_binding*/ ctx[2](value);
    	}

    	let homeframe_props = { frameData: /*frameData*/ ctx[3] };

    	if (/*showRecordPage*/ ctx[0] !== void 0) {
    		homeframe_props.showRecordPage = /*showRecordPage*/ ctx[0];
    	}

    	homeframe = new HomeFrame({ props: homeframe_props });
    	binding_callbacks.push(() => bind(homeframe, 'showRecordPage', homeframe_showRecordPage_binding));

    	return {
    		c() {
    			create_component(homeframe.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(homeframe, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const homeframe_changes = {};
    			if (dirty & /*FramesData*/ 2) homeframe_changes.frameData = /*frameData*/ ctx[3];

    			if (!updating_showRecordPage && dirty & /*showRecordPage*/ 1) {
    				updating_showRecordPage = true;
    				homeframe_changes.showRecordPage = /*showRecordPage*/ ctx[0];
    				add_flush_callback(() => updating_showRecordPage = false);
    			}

    			homeframe.$set(homeframe_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(homeframe.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(homeframe.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(homeframe, detaching);
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let div;
    	let current;
    	let each_value = /*FramesData*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(div, "class", "frameCollection svelte-p5k6wu");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*FramesData, showRecordPage*/ 3) {
    				each_value = /*FramesData*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(div, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { FramesData } = $$props;
    	let { showRecordPage } = $$props;

    	function homeframe_showRecordPage_binding(value) {
    		showRecordPage = value;
    		$$invalidate(0, showRecordPage);
    	}

    	$$self.$$set = $$props => {
    		if ('FramesData' in $$props) $$invalidate(1, FramesData = $$props.FramesData);
    		if ('showRecordPage' in $$props) $$invalidate(0, showRecordPage = $$props.showRecordPage);
    	};

    	return [showRecordPage, FramesData, homeframe_showRecordPage_binding];
    }

    class FrameCollection extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { FramesData: 1, showRecordPage: 0 });
    	}
    }

    /* src\lib\CameraTypeButtons.svelte generated by Svelte v3.39.0 */

    function create_else_block$2(ctx) {
    	let div0;
    	let t1;
    	let div1;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div0 = element("div");
    			div0.innerHTML = `<h3 class="svelte-17zyqyg">Front</h3>`;
    			t1 = space();
    			div1 = element("div");
    			div1.innerHTML = `<h3 style="color:#C7C7C7;" class="svelte-17zyqyg">Back</h3>`;
    			attr(div0, "class", "btnObj svelte-17zyqyg");
    			set_style(div0, "border-radius", "12px 0px 0px 12px");
    			attr(div1, "class", "btnObj svelte-17zyqyg");
    			set_style(div1, "border-radius", "0px 12px 12px 0px");
    			set_style(div1, "background", "#3C3C3C");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t1, anchor);
    			insert(target, div1, anchor);

    			if (!mounted) {
    				dispose = listen(div0, "click", /*click_handler_1*/ ctx[3]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t1);
    			if (detaching) detach(div1);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (12:4) {#if currentCameraType == "FRONT"}
    function create_if_block$3(ctx) {
    	let div0;
    	let t1;
    	let div1;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div0 = element("div");
    			div0.innerHTML = `<h3 style="color:#C7C7C7;" class="svelte-17zyqyg">Front</h3>`;
    			t1 = space();
    			div1 = element("div");
    			div1.innerHTML = `<h3 class="svelte-17zyqyg">Back</h3>`;
    			attr(div0, "class", "btnObj svelte-17zyqyg");
    			set_style(div0, "border-radius", "12px 0px 0px 12px");
    			set_style(div0, "background", "#3C3C3C");
    			attr(div1, "class", "btnObj svelte-17zyqyg");
    			set_style(div1, "border-radius", "0px 12px 12px 0px");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t1, anchor);
    			insert(target, div1, anchor);

    			if (!mounted) {
    				dispose = listen(div1, "click", /*click_handler*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t1);
    			if (detaching) detach(div1);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$4(ctx) {
    	let div;

    	function select_block_type(ctx, dirty) {
    		if (/*currentCameraType*/ ctx[0] == "FRONT") return create_if_block$3;
    		return create_else_block$2;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			div = element("div");
    			if_block.c();
    			attr(div, "class", "btnCollection svelte-17zyqyg");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if_block.m(div, null);
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div, null);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if_block.d();
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { currentCameraType } = $$props;

    	const changeCamType = camType => {
    		$$invalidate(0, currentCameraType = camType);
    	};

    	const click_handler = () => changeCamType("BACK");
    	const click_handler_1 = () => changeCamType("FRONT");

    	$$self.$$set = $$props => {
    		if ('currentCameraType' in $$props) $$invalidate(0, currentCameraType = $$props.currentCameraType);
    	};

    	return [currentCameraType, changeCamType, click_handler, click_handler_1];
    }

    class CameraTypeButtons extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { currentCameraType: 0 });
    	}
    }

    /* src\lib\RecordTimeButtons.svelte generated by Svelte v3.39.0 */

    function create_else_block$1(ctx) {
    	let div0;
    	let t1;
    	let div1;
    	let t3;
    	let div2;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div0 = element("div");
    			div0.innerHTML = `<h3 class="svelte-1osvx2o">5 s</h3>`;
    			t1 = space();
    			div1 = element("div");
    			div1.innerHTML = `<h3 class="svelte-1osvx2o">10 s</h3>`;
    			t3 = space();
    			div2 = element("div");
    			div2.innerHTML = `<h3 style="color:#C7C7C7;" class="svelte-1osvx2o">15 s</h3>`;
    			attr(div0, "class", "btnObj svelte-1osvx2o");
    			set_style(div0, "border-radius", "12px 0px 0px 12px");
    			attr(div1, "class", "btnObj svelte-1osvx2o");
    			attr(div2, "class", "btnObj svelte-1osvx2o");
    			set_style(div2, "border-radius", "0px 12px 12px 0px");
    			set_style(div2, "background", "#3C3C3C");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t1, anchor);
    			insert(target, div1, anchor);
    			insert(target, t3, anchor);
    			insert(target, div2, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(div0, "click", /*click_handler_4*/ ctx[6]),
    					listen(div1, "click", /*click_handler_5*/ ctx[7])
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t1);
    			if (detaching) detach(div1);
    			if (detaching) detach(t3);
    			if (detaching) detach(div2);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (24:32) 
    function create_if_block_1$2(ctx) {
    	let div0;
    	let t1;
    	let div1;
    	let t3;
    	let div2;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div0 = element("div");
    			div0.innerHTML = `<h3 class="svelte-1osvx2o">5 s</h3>`;
    			t1 = space();
    			div1 = element("div");
    			div1.innerHTML = `<h3 style="color:#C7C7C7;" class="svelte-1osvx2o">10 s</h3>`;
    			t3 = space();
    			div2 = element("div");
    			div2.innerHTML = `<h3 class="svelte-1osvx2o">15 s</h3>`;
    			attr(div0, "class", "btnObj svelte-1osvx2o");
    			set_style(div0, "border-radius", "12px 0px 0px 12px");
    			attr(div1, "class", "btnObj svelte-1osvx2o");
    			set_style(div1, "background", "#3C3C3C");
    			attr(div2, "class", "btnObj svelte-1osvx2o");
    			set_style(div2, "border-radius", "0px 12px 12px 0px");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t1, anchor);
    			insert(target, div1, anchor);
    			insert(target, t3, anchor);
    			insert(target, div2, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(div0, "click", /*click_handler_2*/ ctx[4]),
    					listen(div2, "click", /*click_handler_3*/ ctx[5])
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t1);
    			if (detaching) detach(div1);
    			if (detaching) detach(t3);
    			if (detaching) detach(div2);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (12:4) {#if currentTime == 5}
    function create_if_block$2(ctx) {
    	let div0;
    	let t1;
    	let div1;
    	let t3;
    	let div2;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div0 = element("div");
    			div0.innerHTML = `<h3 style="color:#C7C7C7;" class="svelte-1osvx2o">5 s</h3>`;
    			t1 = space();
    			div1 = element("div");
    			div1.innerHTML = `<h3 class="svelte-1osvx2o">10 s</h3>`;
    			t3 = space();
    			div2 = element("div");
    			div2.innerHTML = `<h3 class="svelte-1osvx2o">15 s</h3>`;
    			attr(div0, "class", "btnObj sBtnObj svelte-1osvx2o");
    			set_style(div0, "border-radius", "12px 0px 0px 12px");
    			set_style(div0, "background", "#3C3C3C");
    			attr(div1, "class", "btnObj sBtnObj svelte-1osvx2o");
    			attr(div2, "class", "btnObj sBtnObj svelte-1osvx2o");
    			set_style(div2, "border-radius", "0px 12px 12px 0px");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t1, anchor);
    			insert(target, div1, anchor);
    			insert(target, t3, anchor);
    			insert(target, div2, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(div1, "click", /*click_handler*/ ctx[2]),
    					listen(div2, "click", /*click_handler_1*/ ctx[3])
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t1);
    			if (detaching) detach(div1);
    			if (detaching) detach(t3);
    			if (detaching) detach(div2);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let div;

    	function select_block_type(ctx, dirty) {
    		if (/*currentTime*/ ctx[0] == 5) return create_if_block$2;
    		if (/*currentTime*/ ctx[0] == 10) return create_if_block_1$2;
    		return create_else_block$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			div = element("div");
    			if_block.c();
    			attr(div, "class", "btnCollection svelte-1osvx2o");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if_block.m(div, null);
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div, null);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if_block.d();
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { currentTime } = $$props;

    	const changeTime = newTime => {
    		$$invalidate(0, currentTime = newTime);
    	};

    	const click_handler = () => changeTime(10);
    	const click_handler_1 = () => changeTime(15);
    	const click_handler_2 = () => changeTime(5);
    	const click_handler_3 = () => changeTime(15);
    	const click_handler_4 = () => changeTime(5);
    	const click_handler_5 = () => changeTime(10);

    	$$self.$$set = $$props => {
    		if ('currentTime' in $$props) $$invalidate(0, currentTime = $$props.currentTime);
    	};

    	return [
    		currentTime,
    		changeTime,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3,
    		click_handler_4,
    		click_handler_5
    	];
    }

    class RecordTimeButtons extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { currentTime: 0 });
    	}
    }

    /* src\lib\ConvertUI.svelte generated by Svelte v3.39.0 */

    function create_fragment$2(ctx) {
    	let div0;
    	let t0;
    	let div5;
    	let div1;
    	let video_1;
    	let t1;
    	let a;
    	let t2;
    	let t3;
    	let h2;
    	let t5;
    	let h40;
    	let t7;
    	let div4;
    	let div3;
    	let div2;
    	let t8;
    	let h41;

    	return {
    		c() {
    			div0 = element("div");
    			t0 = space();
    			div5 = element("div");
    			div1 = element("div");
    			video_1 = element("video");
    			t1 = space();
    			a = element("a");
    			t2 = text("DOWNLOADNOW");
    			t3 = space();
    			h2 = element("h2");
    			h2.textContent = "Saving Video";
    			t5 = space();
    			h40 = element("h4");
    			h40.textContent = "This might take a bit";
    			t7 = space();
    			div4 = element("div");
    			div3 = element("div");
    			div2 = element("div");
    			t8 = space();
    			h41 = element("h4");
    			h41.textContent = `${currentTaskText}`;
    			attr(div0, "class", "blackout svelte-8jmvgp");
    			attr(a, "href", /*linkDownlaod*/ ctx[2]);
    			attr(h40, "class", "svelte-8jmvgp");
    			attr(div1, "class", "topAndBottom svelte-8jmvgp");
    			attr(div2, "class", "loadingMain svelte-8jmvgp");
    			attr(div3, "class", "loadingBG svelte-8jmvgp");
    			attr(h41, "class", "svelte-8jmvgp");
    			attr(div4, "class", "topAndBottom svelte-8jmvgp");
    			attr(div5, "class", "bg svelte-8jmvgp");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t0, anchor);
    			insert(target, div5, anchor);
    			append(div5, div1);
    			append(div1, video_1);
    			/*video_1_binding*/ ctx[5](video_1);
    			append(div1, t1);
    			append(div1, a);
    			append(a, t2);
    			append(div1, t3);
    			append(div1, h2);
    			append(div1, t5);
    			append(div1, h40);
    			append(div5, t7);
    			append(div5, div4);
    			append(div4, div3);
    			append(div3, div2);
    			/*div2_binding*/ ctx[6](div2);
    			append(div4, t8);
    			append(div4, h41);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*linkDownlaod*/ 4) {
    				attr(a, "href", /*linkDownlaod*/ ctx[2]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t0);
    			if (detaching) detach(div5);
    			/*video_1_binding*/ ctx[5](null);
    			/*div2_binding*/ ctx[6](null);
    		}
    	};
    }

    let currentTaskText = "Loading in video file...";

    function instance$2($$self, $$props, $$invalidate) {
    	let convertLoadingBar;
    	let { blob } = $$props;
    	let { db } = $$props;
    	let video;
    	let linkDownlaod;

    	onMount(async () => {
    		$$invalidate(0, convertLoadingBar.style.width = "0%", convertLoadingBar);

    		// let frames = extractFramesFromVideo(blob); 
    		// frames.then(function(results){
    		//     convertFrames(results)
    		//     console.log(results);
    		// });
    		ScanVideo(blob);
    	});

    	// async function extractFramesFromVideo(videBlob) {
    	//     return new Promise(async (resolve) => {
    	//         let videoObjectUrl = URL.createObjectURL(videBlob);
    	//         let video = document.createElement("video");
    	//         video.autoplay = true;
    	//         video.playsInline = true;
    	//         video.muted = true;
    	//         video.load();
    	//         while ((video.duration === Infinity || isNaN(video.duration)) && video.readyState < 2) 
    	//         {
    	//             await new Promise((r) => setTimeout(r, 1000));
    	//             video.currentTime = 10000000 * Math.random();
    	//         }
    	//         let seekResolve;
    	//         video.addEventListener('seeked', async function() {
    	//             if(seekResolve) seekResolve();
    	//         });
    	//         video.addEventListener('loadeddata', async function() {
    	//             let canvas = document.createElement('canvas');
    	//             let context = canvas.getContext('2d');
    	//             let [w, h] = [240, 320]
    	//             canvas.width = 240;
    	//             canvas.height = 320;
    	//             let frames = [];
    	//             let fps = 30;
    	//             let wantedFPS = 10;
    	//             let fpsIntervel = fps / wantedFPS;
    	//             let interval = 1 / fps;
    	//             let currentTime = 0;
    	//             let duration = video.duration;
    	//             let frameCounter = 0;
    	//             let totalFrames = Math.round(duration * fps);
    	//             while(currentTime < duration) {
    	//                 video.currentTime = currentTime;
    	//                 await new Promise(r => seekResolve=r);
    	//                 // if(frameCounter % fpsIntervel == 0){
    	//                 //     context.drawImage(video, 0, 0, w, h);
    	//                 //     let base64ImageData = canvas.toDataURL('image/jpeg', 0.9);
    	//                 //     frames.push(base64ImageToBlob(base64ImageData.slice(23)));
    	//                 // }
    	//                 console.log(duration);
    	//                 frameCounter++;
    	//                 // // currentTaskText = "Frame: " + frameCounter + " out of: " + totalFrames;
    	//                 // //convertLoadingBar.style.width = ((currentFrame/totalFrames) * 100) + "%";
    	//                 // //alert(frameCounter);
    	//                 currentTime += interval;
    	//             }
    	//             //alert("done");
    	//             resolve(frames);
    	//             // let newBlob = new Blob(frames, { type: "video/mjpeg" });
    	//             // //console.log(newBlob);
    	//             // linkDownlaod = URL.createObjectURL(newBlob);
    	//             // let formData = new FormData();
    	//             // let newFile = new File([newBlob], "pleaseworkvideo.mjpeg")
    	//             // formData.append("data", newFile);
    	//             // fetch('/upload', {method: "POST", body: formData})
    	//         });
    	//         // set video src *after* listening to events in case it loads so fast
    	//         // that the events occur before we were listening.
    	//         video.src = videoObjectUrl; 
    	//     });
    	//     }
    	const convertFrames = frameData => {

    		//newFrameData = frameData;
    		// frameData.forEach(f => {
    		//     newFrameData.push(base64ImageToBlob(f.slice(23)));
    		// });
    		// frameData.forEach(f => {
    		//     newFrameData.push(base64ImageToBlob(f.slice(23)));
    		// });
    		let newBlob = new Blob(frameData, { type: "video/mjpeg" });

    		$$invalidate(2, linkDownlaod = URL.createObjectURL(newBlob));

    		// console.log(newBlob);
    		let formData = new FormData();

    		let newFile = new File([newBlob], "pleaseworkvideo.mjpeg");
    		formData.append("data", newFile);
    		fetch('/upload', { method: "POST", body: formData });
    	}; // return newFrameData;

    	const ScanVideo = videoBlob => {
    		let videoObjectUrl = URL.createObjectURL(videoBlob);

    		//const video = document.createElement("video");
    		let canvas = document.createElement("canvas");

    		let context = canvas.getContext("2d");
    		let fps = 30;
    		let interval = 1 / fps;
    		let currentTime = 0;
    		canvas.width = 240;
    		canvas.height = 320;
    		$$invalidate(1, video.src = videoObjectUrl, video);
    		$$invalidate(1, video.autoplay = true, video);
    		$$invalidate(1, video.playsInline = true, video);
    		$$invalidate(1, video.muted = true, video);
    		$$invalidate(1, video.controls = false, video);
    		video.load();
    		let duration;
    		let frames = [];
    		let frameCounter = 0;
    		let wantedFPS = 10;
    		let fpsIntervel = fps / wantedFPS;

    		video.addEventListener('seeked', event => {
    			//console.log('Video found the playback position it was looking for.');
    			if (currentTime > duration) {
    				convertFrames(frames);
    				return;
    			}

    			

    			setTimeout(
    				() => {
    					$$invalidate(1, video.currentTime = currentTime, video);

    					if (frameCounter % fpsIntervel == 0) {
    						context.drawImage(video, 0, 0, 240, 320);

    						//let base64ImageData = canvas.toDataURL('image/jpeg', 0.1);
    						canvas.toBlob(
    							function (blob) {
    								frames.push(blob);
    							},
    							'image/jpeg',
    							0.5
    						);
    					}

    					frameCounter++;
    					console.log(currentTime);
    					currentTime += interval;
    				},
    				"100"
    			);
    		});

    		video.addEventListener('loadeddata', function () {
    			duration = video.duration;
    			console.log(duration);
    			$$invalidate(1, video.currentTime = currentTime, video);
    		});

    		video.addEventListener('durationchange', function () {
    			duration = video.duration;
    		});
    	};

    	function video_1_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			video = $$value;
    			$$invalidate(1, video);
    		});
    	}

    	function div2_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			convertLoadingBar = $$value;
    			$$invalidate(0, convertLoadingBar);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('blob' in $$props) $$invalidate(3, blob = $$props.blob);
    		if ('db' in $$props) $$invalidate(4, db = $$props.db);
    	};

    	return [
    		convertLoadingBar,
    		video,
    		linkDownlaod,
    		blob,
    		db,
    		video_1_binding,
    		div2_binding
    	];
    }

    class ConvertUI extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { blob: 3, db: 4 });
    	}
    }

    /* src\lib\RecordPage.svelte generated by Svelte v3.39.0 */

    function create_if_block_4(ctx) {
    	let convertui;
    	let updating_db;
    	let current;

    	function convertui_db_binding(value) {
    		/*convertui_db_binding*/ ctx[14](value);
    	}

    	let convertui_props = { blob: /*blob*/ ctx[7] };

    	if (/*db*/ ctx[0] !== void 0) {
    		convertui_props.db = /*db*/ ctx[0];
    	}

    	convertui = new ConvertUI({ props: convertui_props });
    	binding_callbacks.push(() => bind(convertui, 'db', convertui_db_binding));

    	return {
    		c() {
    			create_component(convertui.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(convertui, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const convertui_changes = {};
    			if (dirty & /*blob*/ 128) convertui_changes.blob = /*blob*/ ctx[7];

    			if (!updating_db && dirty & /*db*/ 1) {
    				updating_db = true;
    				convertui_changes.db = /*db*/ ctx[0];
    				add_flush_callback(() => updating_db = false);
    			}

    			convertui.$set(convertui_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(convertui.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(convertui.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(convertui, detaching);
    		}
    	};
    }

    // (146:8) {#if !isRecording && !recorededVideo}
    function create_if_block_3(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			button.innerHTML = `<h3 class="svelte-1i78tf8">Record</h3>`;
    			attr(button, "class", "recordBtn svelte-1i78tf8");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*click_handler*/ ctx[15]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (161:29) 
    function create_if_block_2(ctx) {
    	let button0;
    	let t1;
    	let button1;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button0 = element("button");
    			button0.innerHTML = `<h3 class="svelte-1i78tf8">Save Video</h3>`;
    			t1 = space();
    			button1 = element("button");
    			button1.innerHTML = `<h3 class="svelte-1i78tf8">Delete Video</h3>`;
    			attr(button0, "class", "saveBtn svelte-1i78tf8");
    			attr(button1, "class", "redBtn svelte-1i78tf8");
    		},
    		m(target, anchor) {
    			insert(target, button0, anchor);
    			insert(target, t1, anchor);
    			insert(target, button1, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*convertVideo*/ ctx[12]),
    					listen(button1, "click", /*deleteVideo*/ ctx[11])
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(button0);
    			if (detaching) detach(t1);
    			if (detaching) detach(button1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (159:26) 
    function create_if_block_1$1(ctx) {
    	let h3;

    	return {
    		c() {
    			h3 = element("h3");
    			h3.textContent = "Recording";
    			attr(h3, "class", "svelte-1i78tf8");
    		},
    		m(target, anchor) {
    			insert(target, h3, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(h3);
    		}
    	};
    }

    // (153:4) {#if !isRecording && !recorededVideo}
    function create_if_block$1(ctx) {
    	let h40;
    	let t1;
    	let cameratypebuttons;
    	let updating_currentCameraType;
    	let t2;
    	let h41;
    	let t4;
    	let recordtimebuttons;
    	let updating_currentTime;
    	let current;

    	function cameratypebuttons_currentCameraType_binding(value) {
    		/*cameratypebuttons_currentCameraType_binding*/ ctx[17](value);
    	}

    	let cameratypebuttons_props = {};

    	if (/*currentCameraType*/ ctx[1] !== void 0) {
    		cameratypebuttons_props.currentCameraType = /*currentCameraType*/ ctx[1];
    	}

    	cameratypebuttons = new CameraTypeButtons({ props: cameratypebuttons_props });
    	binding_callbacks.push(() => bind(cameratypebuttons, 'currentCameraType', cameratypebuttons_currentCameraType_binding));

    	function recordtimebuttons_currentTime_binding(value) {
    		/*recordtimebuttons_currentTime_binding*/ ctx[18](value);
    	}

    	let recordtimebuttons_props = {};

    	if (/*currentTime*/ ctx[2] !== void 0) {
    		recordtimebuttons_props.currentTime = /*currentTime*/ ctx[2];
    	}

    	recordtimebuttons = new RecordTimeButtons({ props: recordtimebuttons_props });
    	binding_callbacks.push(() => bind(recordtimebuttons, 'currentTime', recordtimebuttons_currentTime_binding));

    	return {
    		c() {
    			h40 = element("h4");
    			h40.textContent = "Camera type";
    			t1 = space();
    			create_component(cameratypebuttons.$$.fragment);
    			t2 = space();
    			h41 = element("h4");
    			h41.textContent = "Record Time";
    			t4 = space();
    			create_component(recordtimebuttons.$$.fragment);
    			attr(h40, "class", "svelte-1i78tf8");
    			set_style(h41, "margin-top", "1rem");
    			attr(h41, "class", "svelte-1i78tf8");
    		},
    		m(target, anchor) {
    			insert(target, h40, anchor);
    			insert(target, t1, anchor);
    			mount_component(cameratypebuttons, target, anchor);
    			insert(target, t2, anchor);
    			insert(target, h41, anchor);
    			insert(target, t4, anchor);
    			mount_component(recordtimebuttons, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cameratypebuttons_changes = {};

    			if (!updating_currentCameraType && dirty & /*currentCameraType*/ 2) {
    				updating_currentCameraType = true;
    				cameratypebuttons_changes.currentCameraType = /*currentCameraType*/ ctx[1];
    				add_flush_callback(() => updating_currentCameraType = false);
    			}

    			cameratypebuttons.$set(cameratypebuttons_changes);
    			const recordtimebuttons_changes = {};

    			if (!updating_currentTime && dirty & /*currentTime*/ 4) {
    				updating_currentTime = true;
    				recordtimebuttons_changes.currentTime = /*currentTime*/ ctx[2];
    				add_flush_callback(() => updating_currentTime = false);
    			}

    			recordtimebuttons.$set(recordtimebuttons_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cameratypebuttons.$$.fragment, local);
    			transition_in(recordtimebuttons.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cameratypebuttons.$$.fragment, local);
    			transition_out(recordtimebuttons.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h40);
    			if (detaching) detach(t1);
    			destroy_component(cameratypebuttons, detaching);
    			if (detaching) detach(t2);
    			if (detaching) detach(h41);
    			if (detaching) detach(t4);
    			destroy_component(recordtimebuttons, detaching);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let t0;
    	let button;
    	let t2;
    	let div1;
    	let h3;
    	let t3;
    	let t4;
    	let t5;
    	let div0;
    	let t6;
    	let video;
    	let t7;
    	let current_block_type_index;
    	let if_block2;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*showConvert*/ ctx[6] && create_if_block_4(ctx);
    	let if_block1 = !/*isRecording*/ ctx[4] && !/*recorededVideo*/ ctx[5] && create_if_block_3(ctx);
    	const if_block_creators = [create_if_block$1, create_if_block_1$1, create_if_block_2];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (!/*isRecording*/ ctx[4] && !/*recorededVideo*/ ctx[5]) return 0;
    		if (/*isRecording*/ ctx[4]) return 1;
    		if (/*recorededVideo*/ ctx[5]) return 2;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx))) {
    		if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			button = element("button");
    			button.textContent = "Back";
    			t2 = space();
    			div1 = element("div");
    			h3 = element("h3");
    			t3 = text("Frame #");
    			t4 = text(/*$currentFrameID*/ ctx[8]);
    			t5 = space();
    			div0 = element("div");
    			if (if_block1) if_block1.c();
    			t6 = space();
    			video = element("video");
    			t7 = space();
    			if (if_block2) if_block2.c();
    			attr(button, "class", "backBtn svelte-1i78tf8");
    			attr(h3, "class", "svelte-1i78tf8");
    			video.muted = true;
    			video.autoplay = true;
    			video.playsInline = true;
    			video.loop = true;
    			attr(video, "class", "svelte-1i78tf8");
    			attr(div0, "class", "vidHolder svelte-1i78tf8");
    			attr(div1, "class", "center svelte-1i78tf8");
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			insert(target, button, anchor);
    			insert(target, t2, anchor);
    			insert(target, div1, anchor);
    			append(div1, h3);
    			append(h3, t3);
    			append(h3, t4);
    			append(div1, t5);
    			append(div1, div0);
    			if (if_block1) if_block1.m(div0, null);
    			append(div0, t6);
    			append(div0, video);
    			/*video_binding*/ ctx[16](video);
    			append(div1, t7);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(div1, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*goBack*/ ctx[9]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (/*showConvert*/ ctx[6]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*showConvert*/ 64) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_4(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty & /*$currentFrameID*/ 256) set_data(t4, /*$currentFrameID*/ ctx[8]);

    			if (!/*isRecording*/ ctx[4] && !/*recorededVideo*/ ctx[5]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_3(ctx);
    					if_block1.c();
    					if_block1.m(div0, t6);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(ctx, dirty);
    				}
    			} else {
    				if (if_block2) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block2 = if_blocks[current_block_type_index];

    					if (!if_block2) {
    						if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block2.c();
    					} else {
    						if_block2.p(ctx, dirty);
    					}

    					transition_in(if_block2, 1);
    					if_block2.m(div1, null);
    				} else {
    					if_block2 = null;
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block2);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block2);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(button);
    			if (detaching) detach(t2);
    			if (detaching) detach(div1);
    			if (if_block1) if_block1.d();
    			/*video_binding*/ ctx[16](null);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d();
    			}

    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $currentFrameID;
    	component_subscribe($$self, currentFrameID, $$value => $$invalidate(8, $currentFrameID = $$value));
    	let { showRecordPage } = $$props;
    	let { db } = $$props;
    	let currentCameraType = "BACK";
    	let currentTime = 5;
    	let videoElement;
    	var recorder;
    	let isRecording = false;
    	let recorededVideo = false;
    	let showConvert = false;
    	let blob;

    	const goBack = () => {
    		$$invalidate(13, showRecordPage = false);
    	};

    	//video stuff
    	const record = time => {
    		if (isRecording) return;
    		$$invalidate(4, isRecording = true);
    		recorder.startRecording();
    		var timeOutTime = time * 1000;

    		setTimeout(
    			function () {
    				recorder.stopRecording(stopRecordingCallback);
    			},
    			timeOutTime
    		);
    	};

    	onMount(async () => {
    		captureCamera(function (camera) {
    			$$invalidate(3, videoElement.muted = true, videoElement);
    			$$invalidate(3, videoElement.volume = 0, videoElement);
    			$$invalidate(3, videoElement.srcObject = camera, videoElement);
    			recorder = RecordRTC(camera, { type: 'video' });
    			recorder.camera = camera;
    		});
    	});

    	function captureCamera(callback) {
    		if (currentCameraType == "FRONT") {
    			navigator.mediaDevices.getUserMedia({
    				audio: true,
    				video: {
    					width: 320,
    					height: 240,
    					facingMode: { exact: "environment" }
    				}
    			}).then(function (camera) {
    				callback(camera);
    			}).catch(function (error) {
    				alert('Unable to capture your camera. Please check console logs.');
    				console.error(error);
    			});
    		} else {
    			navigator.mediaDevices.getUserMedia({
    				audio: true,
    				video: { width: 320, height: 240 }
    			}).then(function (camera) {
    				//navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 240, height: 320 }  }).then(function(camera) {
    				callback(camera);
    			}).catch(function (error) {
    				alert('Unable to capture your camera. Please check console logs.');
    				console.error(error);
    			});
    		}
    	}

    	function stopRecordingCallback() {
    		$$invalidate(5, recorededVideo = true);
    		$$invalidate(4, isRecording = false);
    		$$invalidate(3, videoElement.src = $$invalidate(3, videoElement.srcObject = null, videoElement), videoElement);
    		$$invalidate(3, videoElement.muted = false, videoElement);
    		$$invalidate(3, videoElement.volume = 1, videoElement);
    		$$invalidate(3, videoElement.src = URL.createObjectURL(recorder.getBlob()), videoElement);
    		$$invalidate(7, blob = recorder.getBlob());

    		// let frames = extractFramesFromVideo(blob, 30);
    		// console.log(frames);
    		recorder.camera.stop();

    		recorder.destroy();
    		recorder = null;
    	}

    	const deleteVideo = () => {
    		$$invalidate(5, recorededVideo = false);
    		$$invalidate(4, isRecording = false);

    		captureCamera(function (camera) {
    			$$invalidate(3, videoElement.muted = true, videoElement);
    			$$invalidate(3, videoElement.volume = 0, videoElement);
    			$$invalidate(3, videoElement.srcObject = camera, videoElement);
    			recorder = RecordRTC(camera, { type: 'video' });
    			recorder.camera = camera;
    		});
    	};

    	const convertVideo = () => {
    		$$invalidate(6, showConvert = true);
    	};

    	function convertui_db_binding(value) {
    		db = value;
    		$$invalidate(0, db);
    	}

    	const click_handler = () => record(currentTime);

    	function video_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			videoElement = $$value;
    			($$invalidate(3, videoElement), $$invalidate(1, currentCameraType));
    		});
    	}

    	function cameratypebuttons_currentCameraType_binding(value) {
    		currentCameraType = value;
    		$$invalidate(1, currentCameraType);
    	}

    	function recordtimebuttons_currentTime_binding(value) {
    		currentTime = value;
    		$$invalidate(2, currentTime);
    	}

    	$$self.$$set = $$props => {
    		if ('showRecordPage' in $$props) $$invalidate(13, showRecordPage = $$props.showRecordPage);
    		if ('db' in $$props) $$invalidate(0, db = $$props.db);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*currentCameraType*/ 2) {
    			if (currentCameraType == "FRONT" || currentCameraType == "BACK") {
    				captureCamera(function (camera) {
    					$$invalidate(3, videoElement.muted = true, videoElement);
    					$$invalidate(3, videoElement.volume = 0, videoElement);
    					$$invalidate(3, videoElement.srcObject = camera, videoElement);
    					recorder = RecordRTC(camera, { type: 'video' });
    					recorder.camera = camera;
    				});
    			}
    		}
    	};

    	return [
    		db,
    		currentCameraType,
    		currentTime,
    		videoElement,
    		isRecording,
    		recorededVideo,
    		showConvert,
    		blob,
    		$currentFrameID,
    		goBack,
    		record,
    		deleteVideo,
    		convertVideo,
    		showRecordPage,
    		convertui_db_binding,
    		click_handler,
    		video_binding,
    		cameratypebuttons_currentCameraType_binding,
    		recordtimebuttons_currentTime_binding
    	];
    }

    class RecordPage extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { showRecordPage: 13, db: 0 });
    	}
    }

    /* src\App.svelte generated by Svelte v3.39.0 */

    function create_else_block(ctx) {
    	let recordpage;
    	let updating_showRecordPage;
    	let updating_db;
    	let current;

    	function recordpage_showRecordPage_binding(value) {
    		/*recordpage_showRecordPage_binding*/ ctx[7](value);
    	}

    	function recordpage_db_binding(value) {
    		/*recordpage_db_binding*/ ctx[8](value);
    	}

    	let recordpage_props = {};

    	if (/*showRecordPage*/ ctx[1] !== void 0) {
    		recordpage_props.showRecordPage = /*showRecordPage*/ ctx[1];
    	}

    	if (/*db*/ ctx[3] !== void 0) {
    		recordpage_props.db = /*db*/ ctx[3];
    	}

    	recordpage = new RecordPage({ props: recordpage_props });
    	binding_callbacks.push(() => bind(recordpage, 'showRecordPage', recordpage_showRecordPage_binding));
    	binding_callbacks.push(() => bind(recordpage, 'db', recordpage_db_binding));

    	return {
    		c() {
    			create_component(recordpage.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(recordpage, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const recordpage_changes = {};

    			if (!updating_showRecordPage && dirty & /*showRecordPage*/ 2) {
    				updating_showRecordPage = true;
    				recordpage_changes.showRecordPage = /*showRecordPage*/ ctx[1];
    				add_flush_callback(() => updating_showRecordPage = false);
    			}

    			if (!updating_db && dirty & /*db*/ 8) {
    				updating_db = true;
    				recordpage_changes.db = /*db*/ ctx[3];
    				add_flush_callback(() => updating_db = false);
    			}

    			recordpage.$set(recordpage_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(recordpage.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(recordpage.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(recordpage, detaching);
    		}
    	};
    }

    // (114:0) {#if !showRecordPage}
    function create_if_block(ctx) {
    	let t0;
    	let refresh;
    	let t1;
    	let framecollection;
    	let updating_FramesData;
    	let updating_showRecordPage;
    	let current;
    	let if_block = /*showFrameDetected*/ ctx[0] && create_if_block_1(ctx);
    	refresh = new Refresh({});

    	function framecollection_FramesData_binding(value) {
    		/*framecollection_FramesData_binding*/ ctx[5](value);
    	}

    	function framecollection_showRecordPage_binding(value) {
    		/*framecollection_showRecordPage_binding*/ ctx[6](value);
    	}

    	let framecollection_props = {};

    	if (/*FramesData*/ ctx[2] !== void 0) {
    		framecollection_props.FramesData = /*FramesData*/ ctx[2];
    	}

    	if (/*showRecordPage*/ ctx[1] !== void 0) {
    		framecollection_props.showRecordPage = /*showRecordPage*/ ctx[1];
    	}

    	framecollection = new FrameCollection({ props: framecollection_props });
    	binding_callbacks.push(() => bind(framecollection, 'FramesData', framecollection_FramesData_binding));
    	binding_callbacks.push(() => bind(framecollection, 'showRecordPage', framecollection_showRecordPage_binding));

    	return {
    		c() {
    			if (if_block) if_block.c();
    			t0 = space();
    			create_component(refresh.$$.fragment);
    			t1 = space();
    			create_component(framecollection.$$.fragment);
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, t0, anchor);
    			mount_component(refresh, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(framecollection, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*showFrameDetected*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*showFrameDetected*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(t0.parentNode, t0);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			const framecollection_changes = {};

    			if (!updating_FramesData && dirty & /*FramesData*/ 4) {
    				updating_FramesData = true;
    				framecollection_changes.FramesData = /*FramesData*/ ctx[2];
    				add_flush_callback(() => updating_FramesData = false);
    			}

    			if (!updating_showRecordPage && dirty & /*showRecordPage*/ 2) {
    				updating_showRecordPage = true;
    				framecollection_changes.showRecordPage = /*showRecordPage*/ ctx[1];
    				add_flush_callback(() => updating_showRecordPage = false);
    			}

    			framecollection.$set(framecollection_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(refresh.$$.fragment, local);
    			transition_in(framecollection.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			transition_out(refresh.$$.fragment, local);
    			transition_out(framecollection.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(t0);
    			destroy_component(refresh, detaching);
    			if (detaching) detach(t1);
    			destroy_component(framecollection, detaching);
    		}
    	};
    }

    // (116:1) {#if showFrameDetected}
    function create_if_block_1(ctx) {
    	let framedetected;
    	let updating_showFrameDetected;
    	let current;

    	function framedetected_showFrameDetected_binding(value) {
    		/*framedetected_showFrameDetected_binding*/ ctx[4](value);
    	}

    	let framedetected_props = {};

    	if (/*showFrameDetected*/ ctx[0] !== void 0) {
    		framedetected_props.showFrameDetected = /*showFrameDetected*/ ctx[0];
    	}

    	framedetected = new FrameDetected({ props: framedetected_props });
    	binding_callbacks.push(() => bind(framedetected, 'showFrameDetected', framedetected_showFrameDetected_binding));

    	return {
    		c() {
    			create_component(framedetected.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(framedetected, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const framedetected_changes = {};

    			if (!updating_showFrameDetected && dirty & /*showFrameDetected*/ 1) {
    				updating_showFrameDetected = true;
    				framedetected_changes.showFrameDetected = /*showFrameDetected*/ ctx[0];
    				add_flush_callback(() => updating_showFrameDetected = false);
    			}

    			framedetected.$set(framedetected_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(framedetected.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(framedetected.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(framedetected, detaching);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (!/*showRecordPage*/ ctx[1]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let $FRAMEID;
    	component_subscribe($$self, FRAMEID, $$value => $$invalidate(13, $FRAMEID = $$value));
    	let isNewFrame = true;
    	let showFrameDetected = false;
    	let showRecordPage = false;
    	let FramesData = [];
    	let gotFrameID = false;
    	let initializedDB = false;

    	//Get frame ID
    	fetch('getFrameID').then(response => response.json()).then(data => {
    		console.log(data);
    		FRAMEID.set(data.frameID);
    		gotFrameID = true;

    		if (initializedDB == true) {
    			checkFrame($FRAMEID);
    		}
    	}).catch(error => {
    		console.log("Could not connect to frame");
    		FRAMEID.set("OFFLINE");
    		console.log($FRAMEID);
    	});

    	

    	const checkFrame = postFrameID => {
    		console.log(postFrameID);
    		if (postFrameID == "OFFLINE") return false;

    		FramesData.forEach(frame => {
    			if (postFrameID == frame.id) {
    				isNewFrame = false;
    			}
    		});

    		if (isNewFrame) {
    			const transaction = db.transaction(["frames"], "readwrite");

    			transaction.oncomplete = event => {
    				console.log("Added new frame!");
    			};

    			transaction.onerror = event => {
    				// Don't forget to handle errors!
    				console.log("Error adding new frame");
    			};

    			const objectStore = transaction.objectStore("frames");
    			let frameDataScheme = { id: postFrameID, videoFile: null };
    			const request = objectStore.add(frameDataScheme);

    			request.onsuccess = event => {
    				
    			};

    			$$invalidate(0, showFrameDetected = true);
    			FramesData.push(frameDataScheme);
    			$$invalidate(2, FramesData);
    		}
    	};

    	const request = window.indexedDB.open("MyTestDatabase", 1);
    	let db;

    	request.onerror = event => {
    		console.error("Why didn't you allow my web app to use IndexedDB?!");
    	};

    	request.onsuccess = event => {
    		$$invalidate(3, db = event.target.result);
    		const transaction = db.transaction(["frames"]);
    		const objectStore = transaction.objectStore("frames");

    		objectStore.openCursor().onsuccess = event => {
    			const cursor = event.target.result;

    			if (cursor) {
    				//console.log(`Frame ID: ${cursor.key}`);
    				FramesData.push(cursor.value);

    				$$invalidate(2, FramesData);
    				cursor.continue();
    			} else {
    				initializedDB = true;
    				console.log(FramesData);

    				if (gotFrameID == true) {
    					console.log("checking frame in indexdb");
    					checkFrame($FRAMEID);
    				}
    			}
    		};
    	};

    	request.onupgradeneeded = event => {
    		$$invalidate(3, db = event.target.result);
    		db.createObjectStore("frames", { keyPath: "id" });
    	};

    	function framedetected_showFrameDetected_binding(value) {
    		showFrameDetected = value;
    		$$invalidate(0, showFrameDetected);
    	}

    	function framecollection_FramesData_binding(value) {
    		FramesData = value;
    		$$invalidate(2, FramesData);
    	}

    	function framecollection_showRecordPage_binding(value) {
    		showRecordPage = value;
    		$$invalidate(1, showRecordPage);
    	}

    	function recordpage_showRecordPage_binding(value) {
    		showRecordPage = value;
    		$$invalidate(1, showRecordPage);
    	}

    	function recordpage_db_binding(value) {
    		db = value;
    		$$invalidate(3, db);
    	}

    	return [
    		showFrameDetected,
    		showRecordPage,
    		FramesData,
    		db,
    		framedetected_showFrameDetected_binding,
    		framecollection_FramesData_binding,
    		framecollection_showRecordPage_binding,
    		recordpage_showRecordPage_binding,
    		recordpage_db_binding
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    const app = new App({
    	target: document.body
    });

    return app;

})();
