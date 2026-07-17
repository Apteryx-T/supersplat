import { Vec3 } from 'playcanvas';

import { Events } from './events';
import { Scene } from './scene';

type SpatialNodeType = 'button' | 'dialog' | 'card' | 'hotspot' | 'tool' | 'toolbar';
type SpatialTheme = 'glass' | 'bold' | 'viral' | 'editorial' | 'roomtour';

type SpatialNode = {
    id: string;
    type: SpatialNodeType;
    name: string;
    text: string;
    position: [number, number, number];
    scale: number;
    opacity?: number;
    backgroundOpacity: number;
    textOpacity: number;
    borderOpacity: number;
    minVisibleDistance: number;
    maxVisibleDistance: number;
    visible: boolean;
    theme: SpatialTheme;
    targetId?: string;
    eyebrow?: string;
    body?: string;
    meta?: string;
    open?: boolean;
};

type SpatialUiDocument = {
    version: number;
    nodes: SpatialNode[];
};

type MrNode = {
    id?: string;
    type?: SpatialNodeType;
    name?: string;
    text?: string;
    x?: number;
    y?: number;
    w?: number;
    opacity?: number;
    textOpacity?: number;
    borderOpacity?: number;
    minVisibleDistance?: number;
    maxVisibleDistance?: number;
    visible?: boolean;
    cardBody?: string;
    cardArea?: string;
    cardLayout?: string;
    cardPrice?: string;
    eyebrow?: string;
};

type MrDocument = {
    style?: string;
    nodes?: MrNode[];
};

const supportedTypes = new Set<SpatialNodeType>(['button', 'dialog', 'card', 'hotspot', 'tool', 'toolbar']);
const supportedThemes = new Set<SpatialTheme>(['glass', 'bold', 'viral', 'editorial', 'roomtour']);
const defaultScreenScale = 1.6;
const defaultCreationDistance = 3;
const maxVisibleDistanceLimit = 20;
const screenEdgePadding = 200;
const workPosition = new Vec3();
const workScreen = new Vec3();
const workOffset = new Vec3();

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalizeOpacity = (value: unknown, fallback = 1) => {
    const number = Number(value);
    return Number.isFinite(number) ? clamp(number, 0, 1) : fallback;
};
const normalizeDistance = (value: unknown, fallback: number) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
};
const normalizeMinDistance = (value: unknown, fallback: number) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const makeButton = (text: string, className = '') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    return button;
};

const makeField = (label: string, input: HTMLElement) => {
    const field = document.createElement('label');
    field.className = 'spatial-ui-field';
    const caption = document.createElement('span');
    caption.textContent = label;
    field.append(caption, input);
    return field;
};

class SpatialUI {
    private events: Events;
    private scene: Scene;
    private container: HTMLElement;
    private root: HTMLDivElement;
    private nodesLayer: HTMLDivElement;
    private panel: HTMLDivElement;
    private list: HTMLDivElement;
    private inspector: HTMLDivElement;
    private toggle: HTMLButtonElement;
    private fileInput: HTMLInputElement;
    private nodes: SpatialNode[] = [];
    private elements = new Map<string, HTMLDivElement>();
    private selectedId: string | null = null;
    private serial = 1;
    private editorOpen = false;
    private dirty = false;
    private drag: { id: string, x: number, y: number, position: Vec3 } | null = null;

    constructor(events: Events, scene: Scene, container: HTMLElement) {
        this.events = events;
        this.scene = scene;
        this.container = container;

        this.root = document.createElement('div');
        this.root.id = 'spatial-ui-root';
        this.nodesLayer = document.createElement('div');
        this.nodesLayer.className = 'spatial-ui-nodes';
        this.panel = document.createElement('div');
        this.panel.id = 'spatial-ui-panel';
        this.panel.hidden = true;
        this.toggle = makeButton('空间 UI', 'spatial-ui-toggle');
        this.toggle.title = '添加和编辑高斯空间界面';
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'application/json,.json';
        this.fileInput.hidden = true;

        this.root.append(this.nodesLayer, this.panel, this.toggle, this.fileInput);
        this.container.appendChild(this.root);
        this.buildPanel();
        this.bindEvents();

        events.function('docSerialize.spatialUi', () => this.serialize());
        events.function('docDeserialize.spatialUi', (data?: SpatialUiDocument) => this.deserialize(data));
        events.function('spatialUi.dirty', () => this.dirty);
        events.on('doc.saved', () => {
            this.dirty = false;
        });
        events.on('scene.clear', () => this.clear(false));
        events.on('update', () => this.updatePositions());
    }

    private nextId(type: SpatialNodeType) {
        return `spatial-${type}-${this.serial++}`;
    }

    private defaultViewSettings() {
        const camera = this.scene.camera;
        const position = new Vec3().copy(camera.position)
        .add(new Vec3().copy(camera.forward).mulScalar(defaultCreationDistance));
        const perspectiveScale = Math.max(
            0.000001, camera.sceneRadius / defaultCreationDistance * 1.5
        );
        return {
            position: [position.x, position.y, position.z] as [number, number, number],
            scale: defaultScreenScale / perspectiveScale,
            minVisibleDistance: 1.5,
            maxVisibleDistance: 5
        };
    }

    private defaultNode(type: SpatialNodeType): SpatialNode {
        const defaults = this.defaultViewSettings();
        const dialog = this.nodes.find(node => node.type === 'dialog');
        const node: SpatialNode = {
            id: this.nextId(type),
            type,
            name: {
                button: '主要按钮',
                dialog: '空间弹窗',
                card: '房源信息卡',
                hotspot: '空间锚点',
                tool: '悬浮工具',
                toolbar: '空间工具栏'
            }[type],
            text: {
                button: '查看空间信息',
                dialog: '客厅空间',
                card: '云栖公馆 · 客厅',
                hotspot: '+',
                tool: '定位房间',
                toolbar: '空间导航'
            }[type],
            position: defaults.position,
            scale: defaults.scale,
            backgroundOpacity: 1,
            textOpacity: 1,
            borderOpacity: 1,
            minVisibleDistance: defaults.minVisibleDistance,
            maxVisibleDistance: defaults.maxVisibleDistance,
            visible: true,
            theme: 'glass',
            targetId: type === 'button' ? dialog?.id : undefined,
            eyebrow: type === 'card' ? 'ROOM TOUR / HOME' : undefined,
            body: type === 'dialog' ? '这是固定在高斯场景坐标中的交互弹窗。' :
                type === 'card' ? '南向采光 · 开放式客餐厅 · 精装' : undefined,
            meta: type === 'card' ? '274㎡  ·  4室2厅  ·  ¥2750万' : undefined,
            open: type === 'dialog'
        };

        return node;
    }

    private buildPanel() {
        const header = document.createElement('div');
        header.className = 'spatial-ui-panel-header';
        const heading = document.createElement('div');
        heading.innerHTML = '<strong>高斯空间 UI</strong><small>MR UI Generator</small>';
        const close = makeButton('×', 'spatial-ui-panel-close');
        close.setAttribute('aria-label', '关闭空间 UI 编辑器');
        close.addEventListener('click', () => this.setEditorOpen(false));
        header.append(heading, close);

        const help = document.createElement('p');
        help.className = 'spatial-ui-help';
        help.textContent = '组件会添加到当前视图焦点，并固定在高斯场景的世界坐标中。编辑模式下可直接拖动组件。';

        const addGrid = document.createElement('div');
        addGrid.className = 'spatial-ui-add-grid';
        ([
            ['button', '＋ 按钮'],
            ['dialog', '＋ 弹窗'],
            ['card', '＋ 信息卡'],
            ['hotspot', '＋ 锚点']
        ] as [SpatialNodeType, string][]).forEach(([type, label]) => {
            const button = makeButton(label);
            button.dataset.addSpatialUi = type;
            addGrid.appendChild(button);
        });
        const furnitureButton = makeButton('▰ 家具摆放', 'spatial-ui-furniture-entry');
        furnitureButton.addEventListener('click', () => {
            this.setEditorOpen(false);
            this.events.fire('furniture.open');
        });
        addGrid.appendChild(furnitureButton);

        const io = document.createElement('div');
        io.className = 'spatial-ui-io';
        const importButton = makeButton('导入 MR UI JSON');
        importButton.addEventListener('click', () => this.fileInput.click());
        const exportButton = makeButton('导出 UI JSON');
        exportButton.addEventListener('click', () => this.exportJson());
        io.append(importButton, exportButton);

        const listHeading = document.createElement('div');
        listHeading.className = 'spatial-ui-section-title';
        listHeading.textContent = '空间组件';
        this.list = document.createElement('div');
        this.list.className = 'spatial-ui-list';
        this.inspector = document.createElement('div');
        this.inspector.className = 'spatial-ui-inspector';

        this.panel.append(header, help, addGrid, io, listHeading, this.list, this.inspector);
    }

    private bindEvents() {
        this.toggle.addEventListener('click', () => this.setEditorOpen(!this.editorOpen));
        this.panel.addEventListener('pointerdown', event => event.stopPropagation());
        this.toggle.addEventListener('pointerdown', event => event.stopPropagation());

        this.panel.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const add = target.closest<HTMLButtonElement>('[data-add-spatial-ui]');
            if (add) {
                this.addNode(this.defaultNode(add.dataset.addSpatialUi as SpatialNodeType));
            }
        });

        this.fileInput.addEventListener('change', async () => {
            const file = this.fileInput.files?.[0];
            if (!file) return;
            try {
                this.importMrDocument(JSON.parse(await file.text()) as MrDocument);
            } catch (error) {
                await this.events.invoke('showPopup', {
                    type: 'error',
                    header: '无法导入 MR UI',
                    message: error.message ?? String(error)
                });
            } finally {
                this.fileInput.value = '';
            }
        });

        window.addEventListener('pointermove', event => this.dragNode(event));
        window.addEventListener('pointerup', () => {
            if (this.drag) {
                this.drag = null;
                this.markDirty();
                this.renderInspector();
            }
        });
    }

    private setEditorOpen(open: boolean) {
        this.editorOpen = open;
        this.panel.hidden = !open;
        this.root.classList.toggle('is-editing', open);
        this.toggle.classList.toggle('active', open);
        this.toggle.textContent = open ? '完成 UI 编辑' : '空间 UI';
        this.nodes.forEach(node => this.renderNode(node));
        this.renderList();
        this.renderInspector();
    }

    private addNode(node: SpatialNode, dirty = true) {
        this.nodes.push(node);
        const element = document.createElement('div');
        element.className = 'spatial-ui-node spatial-ui-visibility-hidden';
        element.dataset.spatialUiId = node.id;
        element.addEventListener('pointerdown', event => this.onNodePointerDown(event, node));
        element.addEventListener('click', event => this.onNodeClick(event, node));
        this.nodesLayer.appendChild(element);
        this.elements.set(node.id, element);
        this.renderNode(node);
        this.selectedId = node.id;
        if (dirty) this.markDirty();
        this.renderList();
        this.renderInspector();
        this.updatePositions();
    }

    private renderNode(node: SpatialNode) {
        const element = this.elements.get(node.id);
        if (!element) return;
        element.replaceChildren();
        const visibilityClass = element.classList.contains('spatial-ui-visibility-hidden') ?
            ' spatial-ui-visibility-hidden' : '';
        element.className = `spatial-ui-node spatial-ui-${node.type} theme-${node.theme}${visibilityClass}`;
        element.classList.toggle('selected', this.editorOpen && node.id === this.selectedId);
        element.classList.toggle('runtime-hidden', node.type === 'dialog' && !node.open && !this.editorOpen);
        element.style.setProperty('--background-opacity', `${node.backgroundOpacity}`);
        element.style.setProperty('--text-opacity-percent', `${node.textOpacity * 100}%`);
        element.style.setProperty('--border-opacity-percent', `${node.borderOpacity * 100}%`);

        if (node.type === 'button') {
            const icon = document.createElement('span');
            icon.className = 'spatial-ui-action-icon';
            icon.textContent = '→';
            const label = document.createElement('span');
            label.textContent = node.text;
            element.append(icon, label);
        } else if (node.type === 'dialog') {
            const close = makeButton('×', 'spatial-ui-dialog-close');
            close.dataset.dialogAction = 'close';
            const title = document.createElement('strong');
            title.textContent = node.text;
            const body = document.createElement('p');
            body.textContent = node.body || '确认后继续执行空间交互。';
            const actions = document.createElement('div');
            actions.className = 'spatial-ui-dialog-actions';
            const cancel = makeButton('取消');
            cancel.dataset.dialogAction = 'close';
            const confirm = makeButton('确认', 'primary');
            confirm.dataset.dialogAction = 'close';
            actions.append(cancel, confirm);
            element.append(close, title, body, actions);
        } else if (node.type === 'card') {
            const eyebrow = document.createElement('span');
            eyebrow.className = 'spatial-ui-eyebrow';
            eyebrow.textContent = node.eyebrow || 'ROOM TOUR';
            const title = document.createElement('strong');
            title.textContent = node.text;
            const body = document.createElement('p');
            body.textContent = node.body || '';
            const meta = document.createElement('div');
            meta.className = 'spatial-ui-meta';
            meta.textContent = node.meta || '';
            element.append(eyebrow, title, body, meta);
        } else if (node.type === 'hotspot') {
            element.textContent = node.text || '+';
        } else if (node.type === 'tool') {
            const icon = document.createElement('span');
            icon.textContent = '⌖';
            const label = document.createElement('span');
            label.textContent = node.text;
            element.append(icon, label);
        } else {
            ['⌂', '●', '◎', '☼'].forEach((item, index) => {
                const tool = document.createElement('span');
                tool.textContent = item;
                if (index === 1) tool.className = 'active';
                element.appendChild(tool);
            });
        }
    }

    private onNodePointerDown(event: PointerEvent, node: SpatialNode) {
        event.stopPropagation();
        if (!this.editorOpen) return;
        event.preventDefault();
        this.selectedId = node.id;
        this.drag = {
            id: node.id,
            x: event.clientX,
            y: event.clientY,
            position: new Vec3(node.position)
        };
        this.renderList();
        this.renderInspector();
        this.nodes.forEach(item => this.renderNode(item));
    }

    private onNodeClick(event: MouseEvent, node: SpatialNode) {
        event.stopPropagation();
        if (this.editorOpen) return;
        const action = (event.target as HTMLElement).closest<HTMLElement>('[data-dialog-action]');
        if (node.type === 'dialog' && action) {
            node.open = false;
            this.renderNode(node);
            return;
        }
        if (node.type === 'button' || node.type === 'hotspot' || node.type === 'tool') {
            const dialog = this.nodes.find(item => item.id === node.targetId) ?? this.nodes.find(item => item.type === 'dialog');
            if (dialog) {
                dialog.open = true;
                this.renderNode(dialog);
            }
        }
    }

    private dragNode(event: PointerEvent) {
        if (!this.drag) return;
        const node = this.nodes.find(item => item.id === this.drag.id);
        if (!node) return;

        const depth = Math.max(0.1, this.drag.position.distance(this.scene.camera.position));
        const height = Math.max(1, this.container.clientHeight);
        const worldPerPixel = 2 * Math.tan(this.scene.camera.fov * Math.PI / 360) * depth / height;
        const dx = (event.clientX - this.drag.x) * worldPerPixel;
        const dy = (event.clientY - this.drag.y) * worldPerPixel;
        const position = workPosition.copy(this.drag.position);
        position.add(workOffset.copy(this.scene.camera.mainCamera.right).mulScalar(dx));
        position.add(workOffset.copy(this.scene.camera.mainCamera.up).mulScalar(-dy));
        node.position = [position.x, position.y, position.z];
        this.updatePositions();
    }

    private updatePositions() {
        const cameraPosition = this.scene.camera.position;
        const cameraForward = this.scene.camera.forward;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        for (const node of this.nodes) {
            const element = this.elements.get(node.id);
            if (!element) continue;
            workPosition.set(node.position[0], node.position[1], node.position[2]);
            this.scene.camera.worldToScreen(workPosition, workScreen);
            workOffset.sub2(workPosition, cameraPosition);
            const inFront = workOffset.dot(cameraForward) > 0;
            const distance = Math.max(0.001, workOffset.length());
            const perspectiveScale = this.scene.camera.sceneRadius / distance * 1.5;
            const spatialScale = node.scale * perspectiveScale;
            const screenX = workScreen.x * width;
            const screenY = workScreen.y * height;
            const horizontalInset = element.offsetWidth * spatialScale * 0.5 + screenEdgePadding;
            const verticalInset = element.offsetHeight * spatialScale * 0.5 + screenEdgePadding;
            const withinScreenSafeArea = screenX >= horizontalInset && screenX <= width - horizontalInset &&
                screenY >= verticalInset && screenY <= height - verticalInset;
            // Visibility distance is a runtime property of the spatial component.
            // Keep applying it while the editor is open so camera previews match
            // the final result instead of forcing every component to stay visible.
            const withinDistance = distance >= node.minVisibleDistance && distance <= node.maxVisibleDistance;
            const shouldShow = node.visible && inFront && withinScreenSafeArea && withinDistance;
            element.classList.toggle('spatial-ui-visibility-hidden', !shouldShow);
            element.style.left = `${screenX}px`;
            element.style.top = `${screenY}px`;
            element.style.setProperty('--spatial-scale', `${spatialScale}`);
            element.style.zIndex = `${clamp(Math.round(10000 / distance), 1, 9999)}`;
        }
    }

    private renderList() {
        this.list.replaceChildren();
        if (!this.nodes.length) {
            const empty = document.createElement('p');
            empty.className = 'spatial-ui-empty';
            empty.textContent = '还没有空间 UI 组件';
            this.list.appendChild(empty);
            return;
        }

        for (const node of this.nodes) {
            const row = makeButton('', 'spatial-ui-list-row');
            row.classList.toggle('active', node.id === this.selectedId);
            const type = document.createElement('span');
            type.textContent = {
                button: '按钮', dialog: '弹窗', card: '卡片', hotspot: '锚点', tool: '工具', toolbar: '工具栏'
            }[node.type];
            const name = document.createElement('strong');
            name.textContent = node.name;
            const visibility = document.createElement('span');
            visibility.textContent = node.visible ? '●' : '○';
            row.append(type, name, visibility);
            row.addEventListener('click', () => {
                this.selectedId = node.id;
                this.nodes.forEach(item => this.renderNode(item));
                this.renderList();
                this.renderInspector();
            });
            this.list.appendChild(row);
        }
    }

    private renderInspector() {
        this.inspector.replaceChildren();
        const node = this.nodes.find(item => item.id === this.selectedId);
        if (!node) return;

        const heading = document.createElement('div');
        heading.className = 'spatial-ui-section-title';
        heading.textContent = '属性';
        const name = document.createElement('input');
        name.value = node.name;
        const text = document.createElement('input');
        text.value = node.text;
        const scale = document.createElement('input');
        scale.type = 'range';
        scale.min = String(Math.max(node.scale * 0.25, 0.000001));
        scale.max = String(Math.max(node.scale * 4, 0.000002));
        scale.step = String(Math.max(node.scale * 0.01, 0.000001));
        scale.value = String(node.scale);
        const makeOpacityControl = (label: string, value: number) => {
            const input = document.createElement('input');
            input.type = 'range';
            input.min = '0';
            input.max = '100';
            input.step = '1';
            input.value = String(Math.round(value * 100));
            const caption = document.createElement('span');
            caption.textContent = `${label} · ${input.value}%`;
            const field = makeField('', input);
            field.firstElementChild.replaceWith(caption);
            return { input, caption, field, label };
        };
        const backgroundOpacity = makeOpacityControl('背景不透明度', node.backgroundOpacity);
        const textOpacity = makeOpacityControl('字体与图标不透明度', node.textOpacity);
        const borderOpacity = makeOpacityControl('边缘线不透明度', node.borderOpacity);
        const minDistance = document.createElement('input');
        const maxDistance = document.createElement('input');
        const minDistanceNumber = document.createElement('input');
        const maxDistanceNumber = document.createElement('input');
        const distanceMax = maxVisibleDistanceLimit;
        const distanceStep = 0.1;
        minDistance.type = 'range';
        minDistance.min = '0';
        minDistance.max = String(distanceMax);
        minDistance.step = String(distanceStep);
        minDistance.value = String(clamp(node.minVisibleDistance, 0, distanceMax));
        maxDistance.type = 'range';
        maxDistance.min = '0';
        maxDistance.max = String(distanceMax);
        maxDistance.step = String(distanceStep);
        maxDistance.value = String(clamp(node.maxVisibleDistance, 0, distanceMax));
        minDistanceNumber.type = 'number';
        minDistanceNumber.min = '0';
        minDistanceNumber.max = String(distanceMax);
        minDistanceNumber.step = '0.01';
        minDistanceNumber.value = Number(minDistance.value).toFixed(2);
        maxDistanceNumber.type = 'number';
        maxDistanceNumber.min = '0';
        maxDistanceNumber.max = String(distanceMax);
        maxDistanceNumber.step = '0.01';
        maxDistanceNumber.value = Number(maxDistance.value).toFixed(2);
        const minDistanceCaption = document.createElement('span');
        const maxDistanceCaption = document.createElement('span');
        const updateDistanceCaption = () => {
            minDistanceCaption.textContent = `最近可见距离 · ${Number(minDistance.value).toFixed(2)}`;
            maxDistanceCaption.textContent = `最远可见距离 · ${Number(maxDistance.value).toFixed(2)}`;
        };
        updateDistanceCaption();
        const minDistanceControl = document.createElement('div');
        minDistanceControl.className = 'spatial-ui-distance-control';
        minDistanceControl.append(minDistance, minDistanceNumber);
        const maxDistanceControl = document.createElement('div');
        maxDistanceControl.className = 'spatial-ui-distance-control';
        maxDistanceControl.append(maxDistance, maxDistanceNumber);
        const minDistanceField = makeField('', minDistanceControl);
        minDistanceField.firstElementChild?.replaceWith(minDistanceCaption);
        const maxDistanceField = makeField('', maxDistanceControl);
        maxDistanceField.firstElementChild?.replaceWith(maxDistanceCaption);
        const theme = document.createElement('select');
        ([
            ['glass', 'Spatial Glass'], ['bold', '硬核价格牌'], ['viral', '小红书爆款'],
            ['editorial', '建筑编辑部'], ['roomtour', 'Room Tour']
        ] as [SpatialTheme, string][]).forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            theme.appendChild(option);
        });
        theme.value = node.theme;
        const visible = document.createElement('input');
        visible.type = 'checkbox';
        visible.checked = node.visible;

        const update = () => {
            node.name = name.value;
            node.text = text.value;
            node.scale = Number(scale.value);
            node.backgroundOpacity = Number(backgroundOpacity.input.value) / 100;
            node.textOpacity = Number(textOpacity.input.value) / 100;
            node.borderOpacity = Number(borderOpacity.input.value) / 100;
            node.maxVisibleDistance = Number(maxDistance.value);
            node.minVisibleDistance = Math.min(Number(minDistance.value), node.maxVisibleDistance);
            minDistance.max = String(distanceMax);
            minDistance.value = String(node.minVisibleDistance);
            minDistanceNumber.max = String(distanceMax);
            minDistanceNumber.value = node.minVisibleDistance.toFixed(2);
            maxDistanceNumber.value = node.maxVisibleDistance.toFixed(2);
            [backgroundOpacity, textOpacity, borderOpacity].forEach((control) => {
                control.caption.textContent = `${control.label} · ${control.input.value}%`;
            });
            updateDistanceCaption();
            node.theme = theme.value as SpatialTheme;
            node.visible = visible.checked;
            this.renderNode(node);
            this.renderList();
            this.updatePositions();
            this.markDirty();
        };
        name.addEventListener('input', update);
        text.addEventListener('input', update);
        scale.addEventListener('input', update);
        backgroundOpacity.input.addEventListener('input', update);
        textOpacity.input.addEventListener('input', update);
        borderOpacity.input.addEventListener('input', update);
        minDistance.addEventListener('input', update);
        maxDistance.addEventListener('input', update);
        minDistanceNumber.addEventListener('input', () => {
            minDistance.value = String(clamp(Number(minDistanceNumber.value) || 0, 0, node.maxVisibleDistance));
            update();
        });
        maxDistanceNumber.addEventListener('input', () => {
            maxDistance.value = String(clamp(Number(maxDistanceNumber.value) || 0, 0, distanceMax));
            update();
        });
        theme.addEventListener('change', update);
        visible.addEventListener('change', update);

        this.inspector.append(heading, makeField('图层名称', name), makeField('显示文字', text),
            makeField('空间缩放', scale), backgroundOpacity.field, textOpacity.field, borderOpacity.field,
            minDistanceField, maxDistanceField, makeField('视觉风格', theme), makeField('显示组件', visible));

        if (node.type === 'dialog' || node.type === 'card') {
            const body = document.createElement('textarea');
            body.rows = 3;
            body.value = node.body || '';
            body.addEventListener('input', () => {
                node.body = body.value;
                this.renderNode(node);
                this.markDirty();
            });
            this.inspector.appendChild(makeField('说明内容', body));
        }

        if (node.type === 'button' || node.type === 'hotspot' || node.type === 'tool') {
            const target = document.createElement('select');
            const none = document.createElement('option');
            none.value = '';
            none.textContent = '无操作';
            target.appendChild(none);
            this.nodes.filter(item => item.type === 'dialog').forEach((dialog) => {
                const option = document.createElement('option');
                option.value = dialog.id;
                option.textContent = `打开：${dialog.name}`;
                target.appendChild(option);
            });
            target.value = node.targetId || '';
            target.addEventListener('change', () => {
                node.targetId = target.value || undefined;
                this.markDirty();
            });
            this.inspector.appendChild(makeField('点击动作', target));
        }

        const coords = document.createElement('div');
        coords.className = 'spatial-ui-coordinates';
        ['X', 'Y', 'Z'].forEach((axis, index) => {
            const input = document.createElement('input');
            input.type = 'number';
            input.step = '0.01';
            input.value = node.position[index].toFixed(3);
            input.title = axis;
            input.addEventListener('input', () => {
                node.position[index] = Number(input.value);
                this.updatePositions();
                this.markDirty();
            });
            coords.appendChild(input);
        });
        this.inspector.appendChild(makeField('世界坐标 X / Y / Z', coords));

        const actions = document.createElement('div');
        actions.className = 'spatial-ui-inspector-actions';
        const moveToFocus = makeButton('移到视图焦点');
        moveToFocus.addEventListener('click', () => {
            const focal = this.scene.camera.focalPoint;
            node.position = [focal.x, focal.y, focal.z];
            this.updatePositions();
            this.renderInspector();
            this.markDirty();
        });
        const remove = makeButton('删除', 'danger');
        remove.addEventListener('click', () => this.removeNode(node.id));
        actions.append(moveToFocus, remove);
        this.inspector.appendChild(actions);
    }

    private removeNode(id: string) {
        this.nodes = this.nodes.filter(node => node.id !== id);
        this.elements.get(id)?.remove();
        this.elements.delete(id);
        this.nodes.forEach((node) => {
            if (node.targetId === id) node.targetId = undefined;
        });
        this.selectedId = this.nodes[0]?.id ?? null;
        this.markDirty();
        this.renderList();
        this.renderInspector();
    }

    private clear(dirty: boolean) {
        this.nodes = [];
        this.elements.forEach(element => element.remove());
        this.elements.clear();
        this.selectedId = null;
        this.dirty = dirty;
        this.renderList();
        this.renderInspector();
    }

    private markDirty() {
        this.dirty = true;
    }

    private serialize(): SpatialUiDocument {
        return {
            version: 1,
            nodes: this.nodes.map((node) => {
                const { open, opacity, ...persisted } = node;
                return {
                    ...persisted,
                    position: [...node.position] as [number, number, number]
                };
            })
        };
    }

    private deserialize(data?: SpatialUiDocument) {
        this.clear(false);
        if (!data?.nodes) return;
        data.nodes.forEach((raw) => {
            if (!supportedTypes.has(raw.type)) return;
            const defaults = this.defaultViewSettings();
            const legacyOpacity = normalizeOpacity(raw.opacity);
            const node: SpatialNode = {
                ...raw,
                id: raw.id || this.nextId(raw.type),
                position: raw.position?.length === 3 ? [...raw.position] as [number, number, number] : defaults.position,
                scale: clamp(Number(raw.scale) || defaults.scale, 0.25, 4),
                backgroundOpacity: normalizeOpacity(raw.backgroundOpacity, legacyOpacity),
                textOpacity: normalizeOpacity(raw.textOpacity, legacyOpacity),
                borderOpacity: normalizeOpacity(raw.borderOpacity, legacyOpacity),
                minVisibleDistance: normalizeMinDistance(raw.minVisibleDistance, defaults.minVisibleDistance),
                maxVisibleDistance: clamp(
                    normalizeDistance(raw.maxVisibleDistance, defaults.maxVisibleDistance), 0, maxVisibleDistanceLimit
                ),
                theme: supportedThemes.has(raw.theme) ? raw.theme : 'glass',
                visible: raw.visible !== false,
                open: raw.type === 'dialog'
            };
            node.minVisibleDistance = Math.min(node.minVisibleDistance, node.maxVisibleDistance);
            this.addNode(node, false);
        });
        this.dirty = false;
        this.selectedId = this.nodes[0]?.id ?? null;
        this.renderList();
        this.renderInspector();
    }

    private mrPosition(x = 480, y = 270): [number, number, number] {
        const center = this.scene.camera.focalPoint;
        const distance = Math.max(0.1, center.distance(this.scene.camera.position));
        const halfHeight = Math.tan(this.scene.camera.fov * Math.PI / 360) * distance;
        const halfWidth = halfHeight * Math.max(1, this.container.clientWidth) / Math.max(1, this.container.clientHeight);
        const nx = (x / 960 - 0.5) * 2;
        const ny = (0.5 - y / 540) * 2;
        const result = new Vec3().copy(center);
        result.add(workOffset.copy(this.scene.camera.mainCamera.right).mulScalar(nx * halfWidth * 0.82));
        result.add(workOffset.copy(this.scene.camera.mainCamera.up).mulScalar(ny * halfHeight * 0.82));
        return [result.x, result.y, result.z];
    }

    private importMrDocument(data: MrDocument) {
        if (!Array.isArray(data.nodes)) {
            throw new Error('JSON 中没有 MR UI Generator 的 nodes 数组。');
        }
        const themeMap: Record<string, SpatialTheme> = {
            bold: 'bold', viral: 'viral', editorial: 'editorial', roomtour: 'roomtour'
        };
        const theme = themeMap[data.style] ?? 'glass';
        const defaults = this.defaultViewSettings();
        const imported: SpatialNode[] = [];
        data.nodes.forEach((raw) => {
            if (!supportedTypes.has(raw.type)) return;
            const meta = [raw.cardArea, raw.cardLayout, raw.cardPrice].filter(Boolean).join('  ·  ');
            const node: SpatialNode = {
                id: this.nextId(raw.type),
                type: raw.type,
                name: raw.name || `MR ${raw.type}`,
                text: raw.text || '',
                position: this.mrPosition((raw.x ?? 480) + (raw.w ?? 0) / 2, raw.y ?? 270),
                scale: clamp((raw.w ?? 180) / 180, 0.55, 1.8),
                backgroundOpacity: normalizeOpacity((raw.opacity ?? 100) / 100),
                textOpacity: normalizeOpacity((raw.textOpacity ?? 100) / 100),
                borderOpacity: normalizeOpacity((raw.borderOpacity ?? 100) / 100),
                minVisibleDistance: normalizeMinDistance(raw.minVisibleDistance, defaults.minVisibleDistance),
                maxVisibleDistance: clamp(
                    normalizeDistance(raw.maxVisibleDistance, defaults.maxVisibleDistance), 0, maxVisibleDistanceLimit
                ),
                visible: raw.visible !== false,
                theme,
                eyebrow: raw.eyebrow,
                body: raw.cardBody,
                meta,
                open: raw.type === 'dialog'
            };
            node.minVisibleDistance = Math.min(node.minVisibleDistance, node.maxVisibleDistance);
            imported.push(node);
        });
        const dialog = imported.find(node => node.type === 'dialog');
        imported.forEach((node) => {
            if (dialog && ['button', 'hotspot', 'tool'].includes(node.type)) node.targetId = dialog.id;
            this.addNode(node, false);
        });
        this.markDirty();
        this.setEditorOpen(true);
    }

    private exportJson() {
        const blob = new Blob([JSON.stringify(this.serialize(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'supersplat-spatial-ui.json';
        link.click();
        URL.revokeObjectURL(url);
    }
}

export { SpatialUI };
