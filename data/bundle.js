
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
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
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

    function create_fragment$a(ctx) {
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

    function instance$9($$self) {
    	const refreshPage = () => {
    		window.location.href = '/';
    	};

    	return [refreshPage];
    }

    class Refresh extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$9, create_fragment$a, safe_not_equal, {});
    	}
    }

    /* src\lib\FrameIcon.svelte generated by Svelte v3.39.0 */

    function create_fragment$9(ctx) {
    	let div2;
    	let div1;
    	let div0;

    	return {
    		c() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			attr(div0, "class", "small svelte-1jpy78m");
    			attr(div1, "class", "big svelte-1jpy78m");
    			set_style(div1, "background", /*bgColor*/ ctx[0]);
    			attr(div2, "class", "center svelte-1jpy78m");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div1);
    			append(div1, div0);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*bgColor*/ 1) {
    				set_style(div1, "background", /*bgColor*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div2);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { bgColor } = $$props;

    	$$self.$$set = $$props => {
    		if ('bgColor' in $$props) $$invalidate(0, bgColor = $$props.bgColor);
    	};

    	return [bgColor];
    }

    class FrameIcon extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$8, create_fragment$9, safe_not_equal, { bgColor: 0 });
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

    function create_fragment$8(ctx) {
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
    	frameicon = new FrameIcon({ props: { bgColor: "#BEBEBE" } });

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
    		init(this, options, instance$7, create_fragment$8, safe_not_equal, { showFrameDetected: 2 });
    	}
    }

    /* src\lib\FrameSaved.svelte generated by Svelte v3.39.0 */

    function create_fragment$7(ctx) {
    	let div0;
    	let t0;
    	let div1;
    	let h2;
    	let t2;
    	let button;
    	let div1_transition;
    	let current;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div0 = element("div");
    			t0 = space();
    			div1 = element("div");
    			h2 = element("h2");
    			h2.textContent = "Successfully Saved Video!";
    			t2 = space();
    			button = element("button");
    			button.textContent = "Close";
    			attr(div0, "class", "blackout svelte-ojdnk7");
    			attr(h2, "class", "svelte-ojdnk7");
    			attr(button, "class", "svelte-ojdnk7");
    			attr(div1, "class", "bg svelte-ojdnk7");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t0, anchor);
    			insert(target, div1, anchor);
    			append(div1, h2);
    			append(div1, t2);
    			append(div1, button);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*closePopup*/ ctx[0]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div1_transition) div1_transition = create_bidirectional_transition(div1, fade, { duration: 200 }, true);
    				div1_transition.run(1);
    			});

    			current = true;
    		},
    		o(local) {
    			if (!div1_transition) div1_transition = create_bidirectional_transition(div1, fade, { duration: 200 }, false);
    			div1_transition.run(0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t0);
    			if (detaching) detach(div1);
    			if (detaching && div1_transition) div1_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { showFrameSaved } = $$props;

    	const closePopup = () => {
    		$$invalidate(1, showFrameSaved = false);
    	};

    	$$self.$$set = $$props => {
    		if ('showFrameSaved' in $$props) $$invalidate(1, showFrameSaved = $$props.showFrameSaved);
    	};

    	return [closePopup, showFrameSaved];
    }

    class FrameSaved extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$6, create_fragment$7, safe_not_equal, { showFrameSaved: 1 });
    	}
    }

    /* src\lib\HomeFrame.svelte generated by Svelte v3.39.0 */

    function create_else_block$1(ctx) {
    	let div1;

    	return {
    		c() {
    			div1 = element("div");
    			div1.innerHTML = `<div class="small svelte-1p158fv"></div>`;
    			attr(div1, "class", "big svelte-1p158fv");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    		}
    	};
    }

    // (27:42) 
    function create_if_block_2$3(ctx) {
    	let div1;

    	return {
    		c() {
    			div1 = element("div");
    			div1.innerHTML = `<div class="small svelte-1p158fv"></div>`;
    			attr(div1, "class", "big svelte-1p158fv");
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

    // (21:70) 
    function create_if_block_1$3(ctx) {
    	let div2;

    	return {
    		c() {
    			div2 = element("div");
    			div2.innerHTML = `<div class="big svelte-1p158fv" style="background: #E9CA5D;"><div class="small svelte-1p158fv"></div></div>`;
    			attr(div2, "class", "outline svelte-1p158fv");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    		}
    	};
    }

    // (14:4) {#if frameData.id == $FRAMEID && frameData.videoFile == null}
    function create_if_block$3(ctx) {
    	let div2;

    	return {
    		c() {
    			div2 = element("div");
    			div2.innerHTML = `<div class="big svelte-1p158fv"><div class="small svelte-1p158fv"></div></div>`;
    			attr(div2, "class", "outline svelte-1p158fv");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
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
    		if (/*frameData*/ ctx[0].id == /*$FRAMEID*/ ctx[1] && /*frameData*/ ctx[0].videoFile == null) return create_if_block$3;
    		if (/*frameData*/ ctx[0].id == /*$FRAMEID*/ ctx[1] && /*frameData*/ ctx[0].videoFile != null) return create_if_block_1$3;
    		if (/*frameData*/ ctx[0].videoFile != null) return create_if_block_2$3;
    		return create_else_block$1;
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
    			attr(h3, "class", "svelte-1p158fv");
    			attr(div, "class", "frameObject svelte-1p158fv");
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

    function instance$5($$self, $$props, $$invalidate) {
    	let $FRAMEID;
    	component_subscribe($$self, FRAMEID, $$value => $$invalidate(1, $FRAMEID = $$value));
    	let { frameData } = $$props;
    	let { showRecordPage } = $$props;

    	const clickedFrame = () => {
    		currentFrameID.set(frameData.id);
    		$$invalidate(3, showRecordPage = true);
    		console.log(frameData);
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
    		init(this, options, instance$5, create_fragment$6, safe_not_equal, { frameData: 0, showRecordPage: 3 });
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

    function instance$4($$self, $$props, $$invalidate) {
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
    		init(this, options, instance$4, create_fragment$5, safe_not_equal, { FramesData: 1, showRecordPage: 0 });
    	}
    }

    /* src\lib\ConvertUI.svelte generated by Svelte v3.39.0 */

    function create_fragment$4(ctx) {
    	let div0;
    	let t0;
    	let div2;
    	let div1;
    	let h2;
    	let t2;
    	let h4;
    	let t4;
    	let video_1;

    	return {
    		c() {
    			div0 = element("div");
    			t0 = space();
    			div2 = element("div");
    			div1 = element("div");
    			h2 = element("h2");
    			h2.textContent = "Saving Video";
    			t2 = space();
    			h4 = element("h4");
    			h4.textContent = "This might take a bit";
    			t4 = space();
    			video_1 = element("video");
    			attr(div0, "class", "blackout svelte-8jmvgp");
    			attr(h4, "class", "svelte-8jmvgp");
    			attr(div1, "class", "topAndBottom svelte-8jmvgp");
    			attr(div2, "class", "bg svelte-8jmvgp");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t0, anchor);
    			insert(target, div2, anchor);
    			append(div2, div1);
    			append(div1, h2);
    			append(div1, t2);
    			append(div1, h4);
    			append(div1, t4);
    			append(div1, video_1);
    			/*video_1_binding*/ ctx[5](video_1);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t0);
    			if (detaching) detach(div2);
    			/*video_1_binding*/ ctx[5](null);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $currentFrameID;
    	component_subscribe($$self, currentFrameID, $$value => $$invalidate(7, $currentFrameID = $$value));
    	let { blob } = $$props;
    	let { db } = $$props;
    	let { showFrameSaved } = $$props;
    	let { showRecordPage } = $$props;
    	let video;

    	onMount(async () => {
    		//alert(blob.size)
    		ScanVideo(blob);
    	});

    	const convertFrames = frameData => {
    		let newBlob = new Blob(frameData, { type: "video/mjpeg" });
    		URL.createObjectURL(newBlob);
    		const objectStore = db.transaction(["frames"], "readwrite").objectStore("frames");
    		const request = objectStore.get($currentFrameID);

    		request.onerror = event => {
    			console.log("Error uploading video to indexedDB");
    		};

    		request.onsuccess = event => {
    			const data = event.target.result;
    			data.videoFile = newBlob;
    			const requestUpdate = objectStore.put(data);

    			requestUpdate.onerror = event => {
    				// Do something with the error
    				$$invalidate(1, showFrameSaved = false);

    				$$invalidate(2, showRecordPage = false);
    				alert("error saving video");
    				console.log("Data ERROR while loged");
    			};

    			requestUpdate.onsuccess = event => {
    				// Success - the data is updated!
    				$$invalidate(1, showFrameSaved = true);

    				$$invalidate(2, showRecordPage = false);
    				console.log("Data loged");
    			};
    		};
    	}; // let formData = new FormData();
    	// let newFile = new File([newBlob], "pleaseworkvideo.mjpeg")
    	// formData.append("data", newFile);
    	// fetch('/upload', {method: "POST", body: formData})

    	// return newFrameData;
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
    		$$invalidate(0, video.src = videoObjectUrl, video);
    		$$invalidate(0, video.autoplay = true, video);
    		$$invalidate(0, video.playsInline = true, video);
    		$$invalidate(0, video.muted = true, video);
    		$$invalidate(0, video.controls = false, video);
    		video.load();
    		let duration;
    		let frames = [];
    		let frameCounter = 0;
    		let wantedFPS = 10;
    		let fpsIntervel = fps / wantedFPS;

    		video.addEventListener('seeked', event => {
    			if (currentTime > duration) {
    				convertFrames(frames);
    				return;
    			}

    			

    			setTimeout(
    				() => {
    					$$invalidate(0, video.currentTime = currentTime, video);

    					if (frameCounter % fpsIntervel == 0) {
    						context.drawImage(video, 0, 0, 240, 320);

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
    			$$invalidate(0, video.currentTime = currentTime, video);
    		});

    		video.addEventListener('durationchange', function () {
    			duration = video.duration;
    		});
    	};

    	function video_1_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			video = $$value;
    			$$invalidate(0, video);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('blob' in $$props) $$invalidate(3, blob = $$props.blob);
    		if ('db' in $$props) $$invalidate(4, db = $$props.db);
    		if ('showFrameSaved' in $$props) $$invalidate(1, showFrameSaved = $$props.showFrameSaved);
    		if ('showRecordPage' in $$props) $$invalidate(2, showRecordPage = $$props.showRecordPage);
    	};

    	return [video, showFrameSaved, showRecordPage, blob, db, video_1_binding];
    }

    class ConvertUI extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$3, create_fragment$4, safe_not_equal, {
    			blob: 3,
    			db: 4,
    			showFrameSaved: 1,
    			showRecordPage: 2
    		});
    	}
    }

    /* src\lib\FlipIcon.svelte generated by Svelte v3.39.0 */

    function create_fragment$3(ctx) {
    	let svg;
    	let path0;
    	let path1;
    	let path2;
    	let path3;
    	let path4;
    	let path5;

    	return {
    		c() {
    			svg = svg_element("svg");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			path2 = svg_element("path");
    			path3 = svg_element("path");
    			path4 = svg_element("path");
    			path5 = svg_element("path");
    			attr(path0, "d", "M5.43301 19.25C5.24056 19.5833 4.75944 19.5833 4.56699 19.25L1.10289 13.25C0.910436 12.9167 1.151 12.5 1.5359 12.5L8.4641 12.5C8.849 12.5 9.08956 12.9167 8.89711 13.25L5.43301 19.25Z");
    			attr(path0, "fill", "white");
    			attr(path1, "d", "M30.567 10.75C30.7594 10.4167 31.2406 10.4167 31.433 10.75L34.8971 16.75C35.0896 17.0833 34.849 17.5 34.4641 17.5H27.5359C27.151 17.5 26.9104 17.0833 27.1029 16.75L30.567 10.75Z");
    			attr(path1, "fill", "white");
    			attr(path2, "d", "M7 23C7 23 7.86602 23.9803 9 25C10.3697 26.2317 11.2928 26.808 13 27.5C14.8454 28.248 16.0087 28.5 18 28.5C19.9913 28.5 21.1487 28.2335 23 27.5C24.4636 26.9201 25.2717 26.4847 26.5 25.5C27.3618 24.8091 27.8186 24.3694 28.5 23.5C29.2024 22.6039 29.4973 22.0216 30 21C30.8179 19.3379 31.5 16.5 31.5 16.5");
    			attr(path2, "stroke", "white");
    			attr(path2, "stroke-width", "2");
    			attr(path2, "stroke-linecap", "round");
    			attr(path3, "d", "M7 23C7 23 7.86602 23.9803 9 25C10.3697 26.2317 11.2928 26.808 13 27.5C14.8454 28.248 16.0087 28.5 18 28.5C19.9913 28.5 21.1487 28.2335 23 27.5C24.4636 26.9201 25.2717 26.4847 26.5 25.5C27.3618 24.8091 27.8186 24.3694 28.5 23.5C29.2024 22.6039 29.4973 22.0216 30 21C30.8179 19.3379 31.5 16.5 31.5 16.5");
    			attr(path3, "stroke", "white");
    			attr(path3, "stroke-width", "2");
    			attr(path3, "stroke-linecap", "round");
    			attr(path4, "d", "M29 7.5C29 7.5 28.1999 5.97438 27.0659 4.95465C25.6962 3.72292 24.7731 3.14665 23.0659 2.45465C21.2205 1.70661 20.0572 1.45465 18.0659 1.45465C16.0746 1.45465 14.9172 1.72113 13.0659 2.45465C11.6024 3.03455 10.7942 3.46998 9.56592 4.45465C8.70409 5.14554 8.24731 5.58529 7.56592 6.45465C6.86356 7.35076 6.5686 7.93307 6.06592 8.95465C5.24806 10.6167 4.56592 13.4547 4.56592 13.4547");
    			attr(path4, "stroke", "white");
    			attr(path4, "stroke-width", "2");
    			attr(path4, "stroke-linecap", "round");
    			attr(path5, "d", "M29 7.5C29 7.5 28.1999 5.97438 27.0659 4.95465C25.6962 3.72292 24.7731 3.14665 23.0659 2.45465C21.2205 1.70661 20.0572 1.45465 18.0659 1.45465C16.0746 1.45465 14.9172 1.72113 13.0659 2.45465C11.6024 3.03455 10.7942 3.46998 9.56592 4.45465C8.70409 5.14554 8.24731 5.58529 7.56592 6.45465C6.86356 7.35076 6.5686 7.93307 6.06592 8.95465C5.24806 10.6167 4.56592 13.4547 4.56592 13.4547");
    			attr(path5, "stroke", "white");
    			attr(path5, "stroke-width", "2");
    			attr(path5, "stroke-linecap", "round");
    			attr(svg, "width", "36");
    			attr(svg, "height", "30");
    			attr(svg, "viewBox", "0 0 36 30");
    			attr(svg, "fill", "none");
    			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
    		},
    		m(target, anchor) {
    			insert(target, svg, anchor);
    			append(svg, path0);
    			append(svg, path1);
    			append(svg, path2);
    			append(svg, path3);
    			append(svg, path4);
    			append(svg, path5);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(svg);
    		}
    	};
    }

    class FlipIcon extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$3, safe_not_equal, {});
    	}
    }

    /* src\lib\RecordPage.svelte generated by Svelte v3.39.0 */

    function create_if_block_3$1(ctx) {
    	let convertui;
    	let updating_db;
    	let updating_showFrameSaved;
    	let updating_showRecordPage;
    	let current;

    	function convertui_db_binding(value) {
    		/*convertui_db_binding*/ ctx[16](value);
    	}

    	function convertui_showFrameSaved_binding(value) {
    		/*convertui_showFrameSaved_binding*/ ctx[17](value);
    	}

    	function convertui_showRecordPage_binding(value) {
    		/*convertui_showRecordPage_binding*/ ctx[18](value);
    	}

    	let convertui_props = { blob: /*blob*/ ctx[7] };

    	if (/*db*/ ctx[1] !== void 0) {
    		convertui_props.db = /*db*/ ctx[1];
    	}

    	if (/*showFrameSaved*/ ctx[2] !== void 0) {
    		convertui_props.showFrameSaved = /*showFrameSaved*/ ctx[2];
    	}

    	if (/*showRecordPage*/ ctx[0] !== void 0) {
    		convertui_props.showRecordPage = /*showRecordPage*/ ctx[0];
    	}

    	convertui = new ConvertUI({ props: convertui_props });
    	binding_callbacks.push(() => bind(convertui, 'db', convertui_db_binding));
    	binding_callbacks.push(() => bind(convertui, 'showFrameSaved', convertui_showFrameSaved_binding));
    	binding_callbacks.push(() => bind(convertui, 'showRecordPage', convertui_showRecordPage_binding));

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

    			if (!updating_db && dirty & /*db*/ 2) {
    				updating_db = true;
    				convertui_changes.db = /*db*/ ctx[1];
    				add_flush_callback(() => updating_db = false);
    			}

    			if (!updating_showFrameSaved && dirty & /*showFrameSaved*/ 4) {
    				updating_showFrameSaved = true;
    				convertui_changes.showFrameSaved = /*showFrameSaved*/ ctx[2];
    				add_flush_callback(() => updating_showFrameSaved = false);
    			}

    			if (!updating_showRecordPage && dirty & /*showRecordPage*/ 1) {
    				updating_showRecordPage = true;
    				convertui_changes.showRecordPage = /*showRecordPage*/ ctx[0];
    				add_flush_callback(() => updating_showRecordPage = false);
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

    // (100:8) {#if !recorededVideo}
    function create_if_block_2$2(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			button.innerHTML = `<div class="recordCenter svelte-1eo6a6l"></div>`;
    			attr(button, "class", "recordBtn svelte-1eo6a6l");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(button, "mousedown", /*startRecording*/ ctx[12]),
    					listen(button, "mouseup", /*stopRecording*/ ctx[13]),
    					listen(button, "touchstart", /*startRecording*/ ctx[12], { passive: true }),
    					listen(button, "touchend", /*stopRecording*/ ctx[13], { passive: true }),
    					listen(button, "touchcancel", /*stopRecording*/ ctx[13], { passive: true })
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (113:8) {#if !isRecording && !recorededVideo}
    function create_if_block_1$2(ctx) {
    	let button;
    	let flipicon;
    	let current;
    	let mounted;
    	let dispose;
    	flipicon = new FlipIcon({});

    	return {
    		c() {
    			button = element("button");
    			create_component(flipicon.$$.fragment);
    			attr(button, "class", "flipBtn svelte-1eo6a6l");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);
    			mount_component(flipicon, button, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*changeCamType*/ ctx[14]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(flipicon.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(flipicon.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			destroy_component(flipicon);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (125:4) {#if recorededVideo}
    function create_if_block$2(ctx) {
    	let div;
    	let button0;
    	let t1;
    	let button1;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div = element("div");
    			button0 = element("button");
    			button0.innerHTML = `<h3 class="svelte-1eo6a6l">Retake</h3>`;
    			t1 = space();
    			button1 = element("button");
    			button1.innerHTML = `<h3 style="color: #484848;" class="svelte-1eo6a6l">Save</h3>`;
    			attr(button0, "class", "redBtn svelte-1eo6a6l");
    			attr(button1, "class", "saveBtn svelte-1eo6a6l");
    			attr(div, "class", "bottomBtns svelte-1eo6a6l");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, button0);
    			append(div, t1);
    			append(div, button1);

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*deleteVideo*/ ctx[9]),
    					listen(button1, "click", /*convertVideo*/ ctx[10])
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	let t0;
    	let button;
    	let t2;
    	let div2;
    	let h3;
    	let t3;
    	let t4;
    	let t5;
    	let div1;
    	let t6;
    	let t7;
    	let div0;
    	let video;
    	let t8;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*showConvert*/ ctx[6] && create_if_block_3$1(ctx);
    	let if_block1 = !/*recorededVideo*/ ctx[5] && create_if_block_2$2(ctx);
    	let if_block2 = !/*isRecording*/ ctx[4] && !/*recorededVideo*/ ctx[5] && create_if_block_1$2(ctx);
    	let if_block3 = /*recorededVideo*/ ctx[5] && create_if_block$2(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			button = element("button");
    			button.textContent = "Back";
    			t2 = space();
    			div2 = element("div");
    			h3 = element("h3");
    			t3 = text("Frame #");
    			t4 = text(/*$currentFrameID*/ ctx[8]);
    			t5 = space();
    			div1 = element("div");
    			if (if_block1) if_block1.c();
    			t6 = space();
    			if (if_block2) if_block2.c();
    			t7 = space();
    			div0 = element("div");
    			video = element("video");
    			t8 = space();
    			if (if_block3) if_block3.c();
    			attr(button, "class", "backBtn svelte-1eo6a6l");
    			attr(h3, "class", "svelte-1eo6a6l");
    			video.muted = true;
    			video.autoplay = true;
    			video.playsInline = true;
    			video.loop = true;
    			attr(video, "class", "svelte-1eo6a6l");
    			attr(div0, "class", "videoMask svelte-1eo6a6l");
    			attr(div1, "class", "vidHolder svelte-1eo6a6l");
    			attr(div2, "class", "center svelte-1eo6a6l");
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			insert(target, button, anchor);
    			insert(target, t2, anchor);
    			insert(target, div2, anchor);
    			append(div2, h3);
    			append(h3, t3);
    			append(h3, t4);
    			append(div2, t5);
    			append(div2, div1);
    			if (if_block1) if_block1.m(div1, null);
    			append(div1, t6);
    			if (if_block2) if_block2.m(div1, null);
    			append(div1, t7);
    			append(div1, div0);
    			append(div0, video);
    			/*video_binding*/ ctx[19](video);
    			append(div2, t8);
    			if (if_block3) if_block3.m(div2, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*goBack*/ ctx[11]);
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
    					if_block0 = create_if_block_3$1(ctx);
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

    			if (!/*recorededVideo*/ ctx[5]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2$2(ctx);
    					if_block1.c();
    					if_block1.m(div1, t6);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (!/*isRecording*/ ctx[4] && !/*recorededVideo*/ ctx[5]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty & /*isRecording, recorededVideo*/ 48) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_1$2(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div1, t7);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*recorededVideo*/ ctx[5]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);
    				} else {
    					if_block3 = create_if_block$2(ctx);
    					if_block3.c();
    					if_block3.m(div2, null);
    				}
    			} else if (if_block3) {
    				if_block3.d(1);
    				if_block3 = null;
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
    			if (detaching) detach(div2);
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			/*video_binding*/ ctx[19](null);
    			if (if_block3) if_block3.d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $currentFrameID;
    	component_subscribe($$self, currentFrameID, $$value => $$invalidate(8, $currentFrameID = $$value));
    	let { showRecordPage } = $$props;
    	let { db } = $$props;
    	let { showFrameSaved } = $$props;
    	let isFrontCamera = true;
    	let videoElement;
    	let isRecording = false;
    	let recorededVideo = false;
    	let showConvert = false;
    	let blob;

    	onMount(async () => {

    		askForCameraPermission().then(e => {
    		}).catch(function (error) {
    			alert('Unable to capture your camera. Please check console logs.');
    			console.error(error);
    		});

    		
    	});

    	const deleteVideo = () => {
    		$$invalidate(5, recorededVideo = false);
    		$$invalidate(4, isRecording = false);
    		askForCameraPermission();
    	};

    	const convertVideo = () => {
    		$$invalidate(6, showConvert = true);
    	};

    	const goBack = () => {
    		$$invalidate(0, showRecordPage = false);
    	};

    	//new video stuff
    	let camStream = null;

    	let recorder = null;
    	let blobs_recorded = [];

    	async function askForCameraPermission() {
    		if (isFrontCamera == true) {
    			camStream = await navigator.mediaDevices.getUserMedia({
    				audio: true,
    				video: { width: 320, height: 240 }
    			});
    		} else {
    			camStream = await navigator.mediaDevices.getUserMedia({
    				audio: true,
    				video: {
    					width: 320,
    					height: 240,
    					facingMode: { exact: "environment" }
    				}
    			});
    		}

    		recorder = new MediaRecorder(camStream);
    		$$invalidate(3, videoElement.muted = true, videoElement);
    		$$invalidate(3, videoElement.volume = 0, videoElement);
    		$$invalidate(3, videoElement.srcObject = camStream, videoElement);
    	}

    	const startRecording = () => {
    		$$invalidate(5, recorededVideo = false);
    		$$invalidate(4, isRecording = true);

    		recorder.addEventListener('dataavailable', function (e) {
    			blobs_recorded.push(e.data);
    		});

    		recorder.start(100);
    	};

    	const stopRecording = () => {
    		$$invalidate(5, recorededVideo = true);
    		$$invalidate(4, isRecording = false);
    		recorder.stop();
    		camStream.getTracks().forEach(track => track.stop());
    		$$invalidate(3, videoElement.src = $$invalidate(3, videoElement.srcObject = null, videoElement), videoElement);
    		$$invalidate(7, blob = new Blob(blobs_recorded, { type: recorder.mimeType }));
    		let videoLink = URL.createObjectURL(blob);

    		//alert(videoLink)
    		$$invalidate(3, videoElement.src = videoLink, videoElement);
    		console.log(blobs_recorded);
    		console.log(blob);
    	};

    	const changeCamType = () => {
    		$$invalidate(15, isFrontCamera = !isFrontCamera);
    	};

    	function convertui_db_binding(value) {
    		db = value;
    		$$invalidate(1, db);
    	}

    	function convertui_showFrameSaved_binding(value) {
    		showFrameSaved = value;
    		$$invalidate(2, showFrameSaved);
    	}

    	function convertui_showRecordPage_binding(value) {
    		showRecordPage = value;
    		$$invalidate(0, showRecordPage);
    	}

    	function video_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			videoElement = $$value;
    			$$invalidate(3, videoElement);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('showRecordPage' in $$props) $$invalidate(0, showRecordPage = $$props.showRecordPage);
    		if ('db' in $$props) $$invalidate(1, db = $$props.db);
    		if ('showFrameSaved' in $$props) $$invalidate(2, showFrameSaved = $$props.showFrameSaved);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*isFrontCamera*/ 32768) {
    			if (isFrontCamera == true || isFrontCamera == false) {
    				askForCameraPermission();
    			}
    		}
    	};

    	return [
    		showRecordPage,
    		db,
    		showFrameSaved,
    		videoElement,
    		isRecording,
    		recorededVideo,
    		showConvert,
    		blob,
    		$currentFrameID,
    		deleteVideo,
    		convertVideo,
    		goBack,
    		startRecording,
    		stopRecording,
    		changeCamType,
    		isFrontCamera,
    		convertui_db_binding,
    		convertui_showFrameSaved_binding,
    		convertui_showRecordPage_binding,
    		video_binding
    	];
    }

    class RecordPage extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			showRecordPage: 0,
    			db: 1,
    			showFrameSaved: 2
    		});
    	}
    }

    /* src\lib\FrameUpload.svelte generated by Svelte v3.39.0 */

    function create_if_block_2$1(ctx) {
    	let h2;
    	let t1;
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Upload Successful!";
    			t1 = space();
    			button = element("button");
    			button.textContent = "Close";
    			attr(h2, "class", "svelte-lhoyl2");
    			attr(button, "class", "svelte-lhoyl2");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*closePopup*/ ctx[4]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (69:47) 
    function create_if_block_1$1(ctx) {
    	let h2;
    	let t1;
    	let div2;
    	let div1;
    	let div0;

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Uploading...";
    			t1 = space();
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			attr(h2, "class", "svelte-lhoyl2");
    			attr(div0, "class", "loadingMain svelte-lhoyl2");
    			attr(div1, "class", "loadingBG svelte-lhoyl2");
    			attr(div2, "class", "bar svelte-lhoyl2");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t1, anchor);
    			insert(target, div2, anchor);
    			append(div2, div1);
    			append(div1, div0);
    			/*div0_binding*/ ctx[9](div0);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			if (detaching) detach(div2);
    			/*div0_binding*/ ctx[9](null);
    		}
    	};
    }

    // (61:8) {#if !showUploading && !doneUpload}
    function create_if_block$1(ctx) {
    	let h20;
    	let t1;
    	let frameicon;
    	let t2;
    	let h21;
    	let t3;
    	let t4;
    	let t5;
    	let button0;
    	let t7;
    	let button1;
    	let current;
    	let mounted;
    	let dispose;
    	frameicon = new FrameIcon({ props: { bgColor: "#E9CA5D" } });

    	return {
    		c() {
    			h20 = element("h2");
    			h20.textContent = "Upload To Frame";
    			t1 = space();
    			create_component(frameicon.$$.fragment);
    			t2 = space();
    			h21 = element("h2");
    			t3 = text("#");
    			t4 = text(/*$FRAMEID*/ ctx[3]);
    			t5 = space();
    			button0 = element("button");
    			button0.textContent = "Upload";
    			t7 = space();
    			button1 = element("button");
    			button1.textContent = "Cancel";
    			attr(h20, "class", "svelte-lhoyl2");
    			set_style(h21, "color", "#BABABA");
    			attr(h21, "class", "svelte-lhoyl2");
    			attr(button0, "class", "uploadBTN svelte-lhoyl2");
    			attr(button1, "class", "svelte-lhoyl2");
    		},
    		m(target, anchor) {
    			insert(target, h20, anchor);
    			insert(target, t1, anchor);
    			mount_component(frameicon, target, anchor);
    			insert(target, t2, anchor);
    			insert(target, h21, anchor);
    			append(h21, t3);
    			append(h21, t4);
    			insert(target, t5, anchor);
    			insert(target, button0, anchor);
    			insert(target, t7, anchor);
    			insert(target, button1, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*uploadToFrame*/ ctx[5]),
    					listen(button1, "click", /*closePopup*/ ctx[4])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (!current || dirty & /*$FRAMEID*/ 8) set_data(t4, /*$FRAMEID*/ ctx[3]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(frameicon.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(frameicon.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h20);
    			if (detaching) detach(t1);
    			destroy_component(frameicon, detaching);
    			if (detaching) detach(t2);
    			if (detaching) detach(h21);
    			if (detaching) detach(t5);
    			if (detaching) detach(button0);
    			if (detaching) detach(t7);
    			if (detaching) detach(button1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let div0;
    	let t;
    	let div1;
    	let current_block_type_index;
    	let if_block;
    	let div1_transition;
    	let current;
    	const if_block_creators = [create_if_block$1, create_if_block_1$1, create_if_block_2$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (!/*showUploading*/ ctx[1] && !/*doneUpload*/ ctx[2]) return 0;
    		if (/*showUploading*/ ctx[1] && !/*doneUpload*/ ctx[2]) return 1;
    		if (!/*showUploading*/ ctx[1] && /*doneUpload*/ ctx[2]) return 2;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	return {
    		c() {
    			div0 = element("div");
    			t = space();
    			div1 = element("div");
    			if (if_block) if_block.c();
    			attr(div0, "class", "blackout svelte-lhoyl2");
    			attr(div1, "class", "bg svelte-lhoyl2");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t, anchor);
    			insert(target, div1, anchor);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(div1, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(ctx, dirty);
    				}
    			} else {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					} else {
    						if_block.p(ctx, dirty);
    					}

    					transition_in(if_block, 1);
    					if_block.m(div1, null);
    				} else {
    					if_block = null;
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);

    			add_render_callback(() => {
    				if (!div1_transition) div1_transition = create_bidirectional_transition(div1, fade, { duration: 200 }, true);
    				div1_transition.run(1);
    			});

    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			if (!div1_transition) div1_transition = create_bidirectional_transition(div1, fade, { duration: 200 }, false);
    			div1_transition.run(0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t);
    			if (detaching) detach(div1);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d();
    			}

    			if (detaching && div1_transition) div1_transition.end();
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $FRAMEID;
    	component_subscribe($$self, FRAMEID, $$value => $$invalidate(3, $FRAMEID = $$value));
    	let { showUpload } = $$props;
    	let { videoFileToUpload } = $$props;
    	let { db } = $$props;
    	let uploadLoadingBar;
    	let showUploading = false;
    	let doneUpload = false;

    	const closePopup = () => {
    		$$invalidate(6, showUpload = false);
    	};

    	const uploadToFrame = async () => {
    		$$invalidate(1, showUploading = true);
    		let formData = new FormData();
    		let newFile = new File([videoFileToUpload], "frameVideo.mjpeg");
    		formData.append("data", newFile);

    		// fetch('/upload', {method: "POST", body: formData})
    		const xhr = new XMLHttpRequest();

    		xhr.open("POST", "/upload", true);

    		xhr.upload.addEventListener("progress", event => {
    			console.log(event);

    			if (event.lengthComputable) {
    				console.log("upload progress:", event.loaded / event.total * 100);
    				$$invalidate(0, uploadLoadingBar.style.width = event.loaded / event.total * 100 + "%", uploadLoadingBar);
    			}
    		});

    		xhr.onreadystatechange = function () {
    			if (xhr.readyState == 4 && xhr.status == 200) {
    				console.log(xhr.statusText);
    				const request = db.transaction(["frames"], "readwrite").objectStore("frames").delete($FRAMEID);

    				request.onsuccess = event => {
    					
    				}; // It's gone!

    				$$invalidate(2, doneUpload = true);
    				$$invalidate(1, showUploading = false);
    			}
    		};

    		//xhr.setRequestHeader("Content-Type", "application/octet-stream");
    		xhr.send(formData);
    	};

    	function div0_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			uploadLoadingBar = $$value;
    			$$invalidate(0, uploadLoadingBar);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('showUpload' in $$props) $$invalidate(6, showUpload = $$props.showUpload);
    		if ('videoFileToUpload' in $$props) $$invalidate(7, videoFileToUpload = $$props.videoFileToUpload);
    		if ('db' in $$props) $$invalidate(8, db = $$props.db);
    	};

    	return [
    		uploadLoadingBar,
    		showUploading,
    		doneUpload,
    		$FRAMEID,
    		closePopup,
    		uploadToFrame,
    		showUpload,
    		videoFileToUpload,
    		db,
    		div0_binding
    	];
    }

    class FrameUpload extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			showUpload: 6,
    			videoFileToUpload: 7,
    			db: 8
    		});
    	}
    }

    /* src\App.svelte generated by Svelte v3.39.0 */

    function create_else_block(ctx) {
    	let recordpage;
    	let updating_showRecordPage;
    	let updating_db;
    	let updating_showFrameSaved;
    	let current;

    	function recordpage_showRecordPage_binding(value) {
    		/*recordpage_showRecordPage_binding*/ ctx[16](value);
    	}

    	function recordpage_db_binding(value) {
    		/*recordpage_db_binding*/ ctx[17](value);
    	}

    	function recordpage_showFrameSaved_binding(value) {
    		/*recordpage_showFrameSaved_binding*/ ctx[18](value);
    	}

    	let recordpage_props = {};

    	if (/*showRecordPage*/ ctx[1] !== void 0) {
    		recordpage_props.showRecordPage = /*showRecordPage*/ ctx[1];
    	}

    	if (/*db*/ ctx[6] !== void 0) {
    		recordpage_props.db = /*db*/ ctx[6];
    	}

    	if (/*showFrameSaved*/ ctx[0] !== void 0) {
    		recordpage_props.showFrameSaved = /*showFrameSaved*/ ctx[0];
    	}

    	recordpage = new RecordPage({ props: recordpage_props });
    	binding_callbacks.push(() => bind(recordpage, 'showRecordPage', recordpage_showRecordPage_binding));
    	binding_callbacks.push(() => bind(recordpage, 'db', recordpage_db_binding));
    	binding_callbacks.push(() => bind(recordpage, 'showFrameSaved', recordpage_showFrameSaved_binding));

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

    			if (!updating_db && dirty & /*db*/ 64) {
    				updating_db = true;
    				recordpage_changes.db = /*db*/ ctx[6];
    				add_flush_callback(() => updating_db = false);
    			}

    			if (!updating_showFrameSaved && dirty & /*showFrameSaved*/ 1) {
    				updating_showFrameSaved = true;
    				recordpage_changes.showFrameSaved = /*showFrameSaved*/ ctx[0];
    				add_flush_callback(() => updating_showFrameSaved = false);
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

    // (168:0) {#if !showRecordPage}
    function create_if_block(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let t0;
    	let refresh;
    	let t1;
    	let framecollection;
    	let updating_FramesData;
    	let updating_showRecordPage;
    	let current;
    	const if_block_creators = [create_if_block_1, create_if_block_2, create_if_block_3];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*showFrameDetected*/ ctx[3]) return 0;
    		if (/*showFrameSaved*/ ctx[0]) return 1;
    		if (/*showUpload*/ ctx[2]) return 2;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type_1(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	refresh = new Refresh({});

    	function framecollection_FramesData_binding(value) {
    		/*framecollection_FramesData_binding*/ ctx[14](value);
    	}

    	function framecollection_showRecordPage_binding(value) {
    		/*framecollection_showRecordPage_binding*/ ctx[15](value);
    	}

    	let framecollection_props = {};

    	if (/*FramesData*/ ctx[4] !== void 0) {
    		framecollection_props.FramesData = /*FramesData*/ ctx[4];
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
    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(target, anchor);
    			}

    			insert(target, t0, anchor);
    			mount_component(refresh, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(framecollection, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(ctx, dirty);
    				}
    			} else {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					} else {
    						if_block.p(ctx, dirty);
    					}

    					transition_in(if_block, 1);
    					if_block.m(t0.parentNode, t0);
    				} else {
    					if_block = null;
    				}
    			}

    			const framecollection_changes = {};

    			if (!updating_FramesData && dirty & /*FramesData*/ 16) {
    				updating_FramesData = true;
    				framecollection_changes.FramesData = /*FramesData*/ ctx[4];
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
    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d(detaching);
    			}

    			if (detaching) detach(t0);
    			destroy_component(refresh, detaching);
    			if (detaching) detach(t1);
    			destroy_component(framecollection, detaching);
    		}
    	};
    }

    // (174:22) 
    function create_if_block_3(ctx) {
    	let frameupload;
    	let updating_showUpload;
    	let updating_videoFileToUpload;
    	let updating_db;
    	let current;

    	function frameupload_showUpload_binding(value) {
    		/*frameupload_showUpload_binding*/ ctx[11](value);
    	}

    	function frameupload_videoFileToUpload_binding(value) {
    		/*frameupload_videoFileToUpload_binding*/ ctx[12](value);
    	}

    	function frameupload_db_binding(value) {
    		/*frameupload_db_binding*/ ctx[13](value);
    	}

    	let frameupload_props = {};

    	if (/*showUpload*/ ctx[2] !== void 0) {
    		frameupload_props.showUpload = /*showUpload*/ ctx[2];
    	}

    	if (/*videoFileToUpload*/ ctx[5] !== void 0) {
    		frameupload_props.videoFileToUpload = /*videoFileToUpload*/ ctx[5];
    	}

    	if (/*db*/ ctx[6] !== void 0) {
    		frameupload_props.db = /*db*/ ctx[6];
    	}

    	frameupload = new FrameUpload({ props: frameupload_props });
    	binding_callbacks.push(() => bind(frameupload, 'showUpload', frameupload_showUpload_binding));
    	binding_callbacks.push(() => bind(frameupload, 'videoFileToUpload', frameupload_videoFileToUpload_binding));
    	binding_callbacks.push(() => bind(frameupload, 'db', frameupload_db_binding));

    	return {
    		c() {
    			create_component(frameupload.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(frameupload, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const frameupload_changes = {};

    			if (!updating_showUpload && dirty & /*showUpload*/ 4) {
    				updating_showUpload = true;
    				frameupload_changes.showUpload = /*showUpload*/ ctx[2];
    				add_flush_callback(() => updating_showUpload = false);
    			}

    			if (!updating_videoFileToUpload && dirty & /*videoFileToUpload*/ 32) {
    				updating_videoFileToUpload = true;
    				frameupload_changes.videoFileToUpload = /*videoFileToUpload*/ ctx[5];
    				add_flush_callback(() => updating_videoFileToUpload = false);
    			}

    			if (!updating_db && dirty & /*db*/ 64) {
    				updating_db = true;
    				frameupload_changes.db = /*db*/ ctx[6];
    				add_flush_callback(() => updating_db = false);
    			}

    			frameupload.$set(frameupload_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(frameupload.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(frameupload.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(frameupload, detaching);
    		}
    	};
    }

    // (172:26) 
    function create_if_block_2(ctx) {
    	let framesaved;
    	let updating_showFrameSaved;
    	let current;

    	function framesaved_showFrameSaved_binding(value) {
    		/*framesaved_showFrameSaved_binding*/ ctx[10](value);
    	}

    	let framesaved_props = {};

    	if (/*showFrameSaved*/ ctx[0] !== void 0) {
    		framesaved_props.showFrameSaved = /*showFrameSaved*/ ctx[0];
    	}

    	framesaved = new FrameSaved({ props: framesaved_props });
    	binding_callbacks.push(() => bind(framesaved, 'showFrameSaved', framesaved_showFrameSaved_binding));

    	return {
    		c() {
    			create_component(framesaved.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(framesaved, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const framesaved_changes = {};

    			if (!updating_showFrameSaved && dirty & /*showFrameSaved*/ 1) {
    				updating_showFrameSaved = true;
    				framesaved_changes.showFrameSaved = /*showFrameSaved*/ ctx[0];
    				add_flush_callback(() => updating_showFrameSaved = false);
    			}

    			framesaved.$set(framesaved_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(framesaved.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(framesaved.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(framesaved, detaching);
    		}
    	};
    }

    // (170:1) {#if showFrameDetected}
    function create_if_block_1(ctx) {
    	let framedetected;
    	let updating_showFrameDetected;
    	let current;

    	function framedetected_showFrameDetected_binding(value) {
    		/*framedetected_showFrameDetected_binding*/ ctx[9](value);
    	}

    	let framedetected_props = {};

    	if (/*showFrameDetected*/ ctx[3] !== void 0) {
    		framedetected_props.showFrameDetected = /*showFrameDetected*/ ctx[3];
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

    			if (!updating_showFrameDetected && dirty & /*showFrameDetected*/ 8) {
    				updating_showFrameDetected = true;
    				framedetected_changes.showFrameDetected = /*showFrameDetected*/ ctx[3];
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
    	component_subscribe($$self, FRAMEID, $$value => $$invalidate(22, $FRAMEID = $$value));
    	let isNewFrame = true;
    	let showFrameDetected = false;
    	let showFrameSaved = false;
    	let showRecordPage = false;
    	let showUpload = false;
    	let savedVideoConnectedFrame = false;
    	let FramesData = [];
    	let gotFrameID = false;
    	let initializedDB = false;
    	let videoFileToUpload;

    	function getFrameData() {
    		//Get frame ID
    		console.log("Getting Frame ID");

    		fetch('getFrameID').then(response => response.json()).then(data => {
    			console.log("Frame ID: " + data.frameID);
    			FRAMEID.set(data.frameID);
    			gotFrameID = true;

    			if (initializedDB == true) {
    				checkFrame($FRAMEID);
    			}
    		}).catch(error => {
    			console.log("Could not connect to frame");
    			FRAMEID.set("OFFLINE");

    			// FRAMEID.set("001");
    			// gotFrameID = true;
    			// if(initializedDB == true){
    			// 	checkFrame($FRAMEID);
    			// }
    			console.log($FRAMEID);
    		});

    		
    	}

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

    			$$invalidate(3, showFrameDetected = true);
    			FramesData.push(frameDataScheme);
    			$$invalidate(4, FramesData);
    		} else {
    			FramesData.every(f => {
    				if (f.id == postFrameID) {
    					console.log(f.id == postFrameID);

    					if (f.videoFile != null) {
    						$$invalidate(7, savedVideoConnectedFrame = true);
    						$$invalidate(5, videoFileToUpload = f.videoFile);
    					}

    					return false;
    				}

    				return true;
    			});
    		}
    	};

    	const request = window.indexedDB.open("MyTestDatabase", 1);
    	let db;

    	request.onerror = event => {
    		console.error("Why didn't you allow my web app to use IndexedDB?!");
    	};

    	request.onsuccess = event => {
    		$$invalidate(6, db = event.target.result);
    		checkDB();
    	};

    	function checkDB() {
    		$$invalidate(4, FramesData = []);
    		const transaction = db.transaction(["frames"]);
    		const objectStore = transaction.objectStore("frames");

    		objectStore.openCursor().onsuccess = event => {
    			const cursor = event.target.result;

    			if (cursor) {
    				//console.log(`Frame ID: ${cursor.key}`);
    				FramesData.push(cursor.value);

    				$$invalidate(4, FramesData);
    				cursor.continue();
    			} else {
    				$$invalidate(8, initializedDB = true);
    				console.log(FramesData);

    				if (gotFrameID == true) {
    					console.log("checking frame in indexdb");
    					checkFrame($FRAMEID);
    				}
    			}
    		};
    	}

    	request.onupgradeneeded = event => {
    		$$invalidate(6, db = event.target.result);
    		db.createObjectStore("frames", { keyPath: "id" });
    	};

    	function framedetected_showFrameDetected_binding(value) {
    		showFrameDetected = value;
    		$$invalidate(3, showFrameDetected);
    	}

    	function framesaved_showFrameSaved_binding(value) {
    		showFrameSaved = value;
    		$$invalidate(0, showFrameSaved);
    	}

    	function frameupload_showUpload_binding(value) {
    		showUpload = value;
    		(($$invalidate(2, showUpload), $$invalidate(0, showFrameSaved)), $$invalidate(7, savedVideoConnectedFrame));
    	}

    	function frameupload_videoFileToUpload_binding(value) {
    		videoFileToUpload = value;
    		$$invalidate(5, videoFileToUpload);
    	}

    	function frameupload_db_binding(value) {
    		db = value;
    		$$invalidate(6, db);
    	}

    	function framecollection_FramesData_binding(value) {
    		FramesData = value;
    		$$invalidate(4, FramesData);
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
    		$$invalidate(6, db);
    	}

    	function recordpage_showFrameSaved_binding(value) {
    		showFrameSaved = value;
    		$$invalidate(0, showFrameSaved);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*showFrameSaved, savedVideoConnectedFrame*/ 129) {
    			if (showFrameSaved == false) {
    				if (savedVideoConnectedFrame) {
    					$$invalidate(2, showUpload = true);
    				}
    			}
    		}

    		if ($$self.$$.dirty & /*showRecordPage, showUpload, initializedDB*/ 262) {
    			//getFrameData();
    			if (showRecordPage == false || showUpload == false) {
    				getFrameData();

    				if (initializedDB == true) {
    					checkDB();
    				}
    			}
    		}
    	};

    	return [
    		showFrameSaved,
    		showRecordPage,
    		showUpload,
    		showFrameDetected,
    		FramesData,
    		videoFileToUpload,
    		db,
    		savedVideoConnectedFrame,
    		initializedDB,
    		framedetected_showFrameDetected_binding,
    		framesaved_showFrameSaved_binding,
    		frameupload_showUpload_binding,
    		frameupload_videoFileToUpload_binding,
    		frameupload_db_binding,
    		framecollection_FramesData_binding,
    		framecollection_showRecordPage_binding,
    		recordpage_showRecordPage_binding,
    		recordpage_db_binding,
    		recordpage_showFrameSaved_binding
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
