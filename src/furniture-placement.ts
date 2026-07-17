import {
    Asset,
    BoundingBox,
    Color,
    ContainerResource,
    Entity,
    Ray,
    RenderComponent,
    Vec3
} from 'playcanvas';

import { Events } from './events';
import { Scene } from './scene';

type FurnitureCategory = 'furniture' | 'appliance' | 'decoration';

type FurnitureDefinition = {
    id: string;
    label: string;
    category: FurnitureCategory;
    filename: string;
};

type FurnitureState = {
    id: string;
    kind: string;
    position: [number, number, number];
    rotation: number;
    scale: number;
};

type FurnitureDocument = {
    version: number;
    items: FurnitureState[];
};

type FurnitureItem = FurnitureState & {
    entity: Entity;
    scaleRoot: Entity;
    baseScale: number;
    localBound: BoundingBox;
};

const furnitureCatalog: FurnitureDefinition[] = [
    { id: 'office-desk', label: '办公桌', category: 'furniture', filename: 'office_desk.glb' },
    { id: 'balcony-chair', label: '阳台椅', category: 'furniture', filename: 'Furniture_BalconyChair_001.glb' },
    { id: 'bed', label: '双人床', category: 'furniture', filename: 'Furniture_Bed_001.glb' },
    { id: 'child-bed', label: '儿童床', category: 'furniture', filename: 'Furniture_ChildBed_001.glb' },
    { id: 'coffee-table', label: '茶几', category: 'furniture', filename: 'Furniture_CoffeeTable_001.glb' },
    { id: 'dining-chair', label: '餐椅', category: 'furniture', filename: 'Furniture_DiningChair_001.glb' },
    { id: 'dining-table', label: '餐桌', category: 'furniture', filename: 'Furniture_DiningTable_001.glb' },
    { id: 'night-stand', label: '床头柜', category: 'furniture', filename: 'Furniture_NightStand_001.glb' },
    { id: 'sofa', label: '沙发', category: 'furniture', filename: 'Furniture_Sofa_001.glb' },
    { id: 'study-desk', label: '书桌', category: 'furniture', filename: 'Furniture_StudyDesk_001.glb' },
    { id: 'tv-cabinet', label: '电视柜', category: 'furniture', filename: 'Furniture_TVCabinet_001.glb' },
    { id: 'cooktop', label: '灶台', category: 'appliance', filename: 'Appliance_Cooktop_001.glb' },
    { id: 'dryer', label: '烘干机', category: 'appliance', filename: 'Appliance_Dryer_001.glb' },
    { id: 'mirror', label: '镜子', category: 'appliance', filename: 'Appliance_Mirror_001.glb' },
    { id: 'range-hood', label: '抽油烟机', category: 'appliance', filename: 'Appliance_RangeHood_001.glb' },
    { id: 'refrigerator', label: '冰箱', category: 'appliance', filename: 'Appliance_Refrigerator_001.glb' },
    { id: 'shower', label: '淋浴房', category: 'appliance', filename: 'Appliance_Shower_001.glb' },
    { id: 'television', label: '电视', category: 'appliance', filename: 'Appliance_Television_001.glb' },
    { id: 'toilet', label: '马桶', category: 'appliance', filename: 'Appliance_Toilet_001.glb' },
    { id: 'wash-basin', label: '洗手台', category: 'appliance', filename: 'Appliance_WashBasin_001.glb' },
    { id: 'washing-machine', label: '洗衣机', category: 'appliance', filename: 'Appliance_WashingMachine_001.glb' },
    { id: 'carpet', label: '地毯', category: 'decoration', filename: 'Decoration_Carpet_001.glb' },
    { id: 'curtain', label: '窗帘', category: 'decoration', filename: 'Decoration_Curtain_001.glb' },
    { id: 'cushion', label: '抱枕', category: 'decoration', filename: 'Decoration_Cushion_001.glb' },
    { id: 'floor-lamp', label: '落地灯', category: 'decoration', filename: 'Decoration_FloorLamp_001.glb' },
    { id: 'painting', label: '装饰画', category: 'decoration', filename: 'Decoration_Painting_001.glb' },
    { id: 'plant', label: '绿植', category: 'decoration', filename: 'Decoration_Plant_001.glb' },
    { id: 'vase', label: '花瓶', category: 'decoration', filename: 'Decoration_Vase_001.glb' }
];
const catalogById = new Map(furnitureCatalog.map(definition => [definition.id, definition]));
const categoryLabels: Record<'all' | FurnitureCategory, string> = {
    all: '全部', furniture: '家具', appliance: '家电', decoration: '装饰'
};
const categoryIcons: Record<FurnitureCategory, string> = {
    furniture: '▰', appliance: '◉', decoration: '✦'
};
const modelUrl = (definition: FurnitureDefinition) => `static/furniture/${definition.filename}`;
const workScreen = new Vec3();
const workPosition = new Vec3();
const workRay = new Ray();
const furnitureBoundColor = new Color(1, 1, 1, 0.72);
const selectedBoundColor = new Color(1, 0.68, 0.3, 1);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const makeButton = (text: string, className = '') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    return button;
};

class FurniturePlacement {
    private events: Events;
    private scene: Scene;
    private container: HTMLElement;
    private root: HTMLDivElement;
    private surface: HTMLDivElement;
    private dock: HTMLDivElement;
    private controls: HTMLDivElement;
    private selection: HTMLDivElement;
    private count: HTMLElement;
    private hint: HTMLElement;
    private scaleLabel: HTMLOutputElement;
    private products: HTMLDivElement;
    private items: FurnitureItem[] = [];
    private selectedId: string | null = null;
    private serial = 1;
    private open = false;
    private dirty = false;
    private assets = new Map<string, Asset>();
    private assetPromises = new Map<string, Promise<Asset>>();
    private activeCategory: 'all' | FurnitureCategory = 'all';
    private drag: { item: FurnitureItem, moved: boolean, offsetX: number, offsetZ: number } | null = null;

    constructor(events: Events, scene: Scene, container: HTMLElement) {
        this.events = events;
        this.scene = scene;
        this.container = container;

        this.root = document.createElement('div');
        this.root.id = 'furniture-placement-root';
        this.surface = document.createElement('div');
        this.surface.className = 'furniture-placement-surface';
        this.dock = document.createElement('div');
        this.dock.className = 'furniture-dock';
        this.selection = document.createElement('div');
        this.selection.className = 'furniture-selection';
        this.controls = document.createElement('div');
        this.controls.className = 'furniture-controls';
        this.root.append(this.surface, this.selection, this.dock, this.controls);
        this.container.appendChild(this.root);

        this.buildDock();
        this.buildControls();
        this.bindEvents();

        events.function('docSerialize.furniture', () => this.serialize());
        events.function('docDeserialize.furniture', (data?: FurnitureDocument) => this.deserialize(data));
        events.function('furniture.dirty', () => this.dirty);
        events.on('doc.saved', () => {
            this.dirty = false;
        });
        events.on('scene.clear', () => this.clear(false));
        events.on('update', () => this.updateOverlay());
        events.on('prerender', () => this.renderBounds());
        events.on('furniture.open', () => this.setOpen(true));
    }

    private buildDock() {
        const categories = document.createElement('div');
        categories.className = 'furniture-categories';
        (Object.entries(categoryLabels) as ['all' | FurnitureCategory, string][]).forEach(([category, label]) => {
            const button = makeButton(label, category === this.activeCategory ? 'active' : '');
            button.dataset.furnitureCategory = category;
            button.addEventListener('click', () => {
                this.activeCategory = category;
                categories.querySelectorAll('[data-furniture-category]').forEach(element =>
                    element.classList.toggle('active', (element as HTMLElement).dataset.furnitureCategory === category)
                );
                this.renderProducts();
            });
            categories.appendChild(button);
        });
        const mode = document.createElement('span');
        mode.className = 'furniture-mode-status';
        mode.innerHTML = '<i></i>摆放模式';
        const close = makeButton('×', 'furniture-close');
        close.setAttribute('aria-label', '退出家具摆放');
        close.addEventListener('click', () => this.setOpen(false));
        categories.append(mode, close);

        const shelf = document.createElement('div');
        shelf.className = 'furniture-shelf';
        this.products = document.createElement('div');
        this.products.className = 'furniture-products';
        const info = document.createElement('p');
        this.count = document.createElement('strong');
        this.hint = document.createElement('span');
        info.append(this.count, this.hint);
        shelf.append(this.products, info);
        this.dock.append(categories, shelf);
        this.renderProducts();
        this.updateStatus();
    }

    private renderProducts() {
        this.products.replaceChildren();
        furnitureCatalog
        .filter(definition => this.activeCategory === 'all' || definition.category === this.activeCategory)
        .forEach((definition) => {
            const button = makeButton('', 'furniture-product');
            button.dataset.furnitureKind = definition.id;
            button.innerHTML = `
                <span class="furniture-model-thumb category-${definition.category}" aria-hidden="true">
                    <i>${categoryIcons[definition.category]}</i>
                </span>
                <span><strong>${definition.label}</strong><small>${definition.filename.replace(/_001\.glb$/i, '').replace(/^(Furniture|Appliance|Decoration)_/, '')}</small></span>
                <em>＋</em>`;
            button.addEventListener('click', () => this.addModel(definition.id, undefined, true, button));
            this.products.appendChild(button);
        });
        this.hint.textContent = `${this.products.childElementCount} 个模型 · 点击添加`;
    }

    private buildControls() {
        const actions: [string, string, string][] = [
            ['rotate-left', '↶', '向左旋转'],
            ['rotate-right', '↷', '向右旋转'],
            ['separator', '', ''],
            ['scale-down', '−', '缩小'],
            ['scale-up', '＋', '放大'],
            ['separator', '', ''],
            ['lower', '↓', '降低'],
            ['raise', '↑', '升高'],
            ['separator', '', ''],
            ['duplicate', '⧉', '复制'],
            ['delete', '⌫', '删除']
        ];
        actions.forEach(([action, label, title]) => {
            if (action === 'separator') {
                this.controls.appendChild(document.createElement('span'));
                return;
            }
            const button = makeButton(label, action === 'delete' ? 'danger' : '');
            button.dataset.furnitureAction = action;
            button.title = title;
            this.controls.appendChild(button);
            if (action === 'scale-down') {
                this.scaleLabel = document.createElement('output');
                this.controls.appendChild(this.scaleLabel);
            }
        });
    }

    private bindEvents() {
        // Observe the canvas container in capture phase, but only consume the
        // pointer when a furniture model is actually hit. Empty-space gestures
        // continue to SuperSplat's camera controllers.
        this.container.addEventListener('pointerdown', event => this.onPointerDown(event), true);
        window.addEventListener('pointermove', event => this.onPointerMove(event), true);
        window.addEventListener('pointerup', event => this.onPointerUp(event), true);
        window.addEventListener('pointercancel', event => this.onPointerUp(event), true);
        this.dock.addEventListener('pointerdown', event => event.stopPropagation());
        this.controls.addEventListener('pointerdown', event => event.stopPropagation());
        this.controls.addEventListener('click', (event) => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-furniture-action]');
            if (button) this.runAction(button.dataset.furnitureAction);
        });
        window.addEventListener('keydown', (event) => {
            if (!this.open || !this.selectedId) return;
            if (event.key === 'Delete' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
                this.removeSelected();
            }
            if (event.key === 'Escape') this.setOpen(false);
        });
    }

    private setOpen(open: boolean) {
        this.open = open;
        this.root.classList.toggle('active', open);
        if (open && !this.selectedId && this.items.length) this.selectedId = this.items[this.items.length - 1].id;
        this.scene.forceRender = true;
        this.updateStatus();
        this.updateOverlay();
    }

    private async loadAsset(definition: FurnitureDefinition, button?: HTMLButtonElement) {
        const cached = this.assets.get(definition.id);
        if (cached) return cached;
        const pending = this.assetPromises.get(definition.id);
        if (pending) return pending;
        if (button) {
            button.disabled = true;
            button.classList.add('loading');
        }
        this.hint.textContent = `正在加载${definition.label}…`;
        const asset = new Asset(definition.label, 'container', { url: modelUrl(definition) });
        this.scene.app.assets.add(asset);
        const promise = new Promise<Asset>((resolve, reject) => {
            asset.ready(() => resolve(asset));
            asset.once('error', (error: Error) => reject(error));
            this.scene.app.assets.load(asset);
        });
        this.assetPromises.set(definition.id, promise);
        try {
            const loaded = await promise;
            this.assets.set(definition.id, loaded);
            this.ensureLighting();
            return loaded;
        } finally {
            if (button) {
                button.disabled = false;
                button.classList.remove('loading');
            }
            this.assetPromises.delete(definition.id);
        }
    }

    private ensureLighting() {
        if (this.scene.app.root.findByName('Furniture Key Light')) return;
        this.scene.app.scene.ambientLight = new Color(0.72, 0.72, 0.72);
        const light = new Entity('Furniture Key Light');
        light.addComponent('light', {
            type: 'directional',
            color: new Color(1, 0.93, 0.84),
            intensity: 1.35,
            castShadows: false
        });
        light.setEulerAngles(52, -38, 0);
        this.scene.app.root.addChild(light);
    }

    private calculateBaseScale(model: Entity) {
        model.syncHierarchy();
        let bound: BoundingBox | null = null;
        const renders = model.findComponents('render') as RenderComponent[];
        renders.forEach((render) => render.meshInstances.forEach((meshInstance) => {
            if (!bound) {
                bound = new BoundingBox();
                bound.copy(meshInstance.aabb);
            }
            else bound.add(meshInstance.aabb);
        }));
        if (!bound) {
            return {
                scale: 1,
                center: new Vec3(),
                floor: 0,
                localBound: new BoundingBox(new Vec3(0, 0.5, 0), new Vec3(0.5, 0.5, 0.5))
            };
        }
        const size = bound.halfExtents.clone().mulScalar(2);
        const targetWidth = clamp(this.scene.camera.sceneRadius * 0.34, 0.45, 2.4);
        const paddedHalfExtents = new Vec3(size.x * 0.525, size.y * 0.525, size.z * 0.525);
        return {
            scale: targetWidth / Math.max(0.0001, size.x, size.y, size.z),
            center: bound.center.clone(),
            floor: bound.getMin().y,
            localBound: new BoundingBox(new Vec3(0, paddedHalfExtents.y, 0), paddedHalfExtents)
        };
    }

    private async addModel(
        kind: string,
        raw?: Partial<FurnitureState>,
        markDirty = true,
        button?: HTMLButtonElement
    ) {
        try {
            const definition = catalogById.get(kind) ?? catalogById.get('office-desk');
            const asset = await this.loadAsset(definition, button);
            if (raw?.id) {
                const suffix = Number(raw.id.match(/(\d+)$/)?.[1]);
                if (Number.isFinite(suffix)) this.serial = Math.max(this.serial, suffix + 1);
            }
            const wrapper = new Entity(raw?.id || `furniture-${definition.id}-${this.serial++}`);
            const scaleRoot = new Entity('Furniture Scale');
            const model = (asset.resource as ContainerResource).instantiateRenderEntity();
            wrapper.addChild(scaleRoot);
            scaleRoot.addChild(model);
            this.scene.contentRoot.addChild(wrapper);

            const normalization = this.calculateBaseScale(model);
            model.setLocalPosition(-normalization.center.x, -normalization.floor, -normalization.center.z);

            const focal = this.scene.camera.focalPoint;
            const floorY = this.scene.bound.getMin().y;
            const position = raw?.position || [focal.x, floorY, focal.z];
            const item: FurnitureItem = {
                id: wrapper.name,
                kind: definition.id,
                position: [...position] as [number, number, number],
                rotation: Number(raw?.rotation) || 0,
                scale: clamp(Number(raw?.scale) || 1, 0.25, 3),
                entity: wrapper,
                scaleRoot,
                baseScale: normalization.scale,
                localBound: normalization.localBound
            };
            this.items.push(item);
            this.selectedId = item.id;
            this.applyTransform(item);
            if (markDirty) this.markDirty();
            this.updateStatus();
            this.updateOverlay();
        } catch (error) {
            const definition = catalogById.get(kind);
            this.hint.textContent = `${definition?.label ?? '模型'}加载失败`;
            await this.events.invoke('showPopup', {
                type: 'error',
                header: '无法加载家具模型',
                message: error.message ?? String(error)
            });
        }
    }

    private applyTransform(item: FurnitureItem) {
        item.entity.setLocalPosition(item.position[0], item.position[1], item.position[2]);
        item.entity.setLocalEulerAngles(0, item.rotation, 0);
        const scale = item.baseScale * item.scale;
        item.scaleRoot.setLocalScale(scale, scale, scale);
        this.scene.forceRender = true;
    }

    private itemAt(clientX: number, clientY: number) {
        const rect = this.container.getBoundingClientRect();
        let nearest: FurnitureItem | null = null;
        let nearestDistance = Infinity;
        this.items.forEach((item) => {
            workPosition.set(item.position[0], item.position[1], item.position[2]);
            this.scene.camera.worldToScreen(workPosition, workScreen);
            const dx = clientX - (rect.left + workScreen.x * rect.width);
            const dy = clientY - (rect.top + workScreen.y * rect.height);
            const distance = Math.hypot(dx, dy);
            if (distance < nearestDistance) {
                nearest = item;
                nearestDistance = distance;
            }
        });
        return nearestDistance < 110 ? nearest : null;
    }

    private pointerOnPlane(y: number, event: PointerEvent, target: Vec3) {
        const rect = this.container.getBoundingClientRect();
        this.scene.camera.getRay(event.clientX - rect.left, event.clientY - rect.top, workRay);
        if (Math.abs(workRay.direction.y) < 0.0001) return false;
        const distance = (y - workRay.origin.y) / workRay.direction.y;
        if (distance <= 0) return false;
        target.copy(workRay.origin).add(workRay.direction.clone().mulScalar(distance));
        return true;
    }

    private moveToPointer(item: FurnitureItem, event: PointerEvent, offsetX: number, offsetZ: number) {
        if (!this.pointerOnPlane(item.position[1], event, workPosition)) return;
        item.position[0] = workPosition.x + offsetX;
        item.position[2] = workPosition.z + offsetZ;
        this.applyTransform(item);
        this.updateOverlay();
    }

    private onPointerDown(event: PointerEvent) {
        if (!this.open || event.button !== 0) return;
        if ((event.target as HTMLElement).closest(
            '.furniture-dock, .furniture-controls, button, input, select, textarea, [role="button"]'
        )) return;
        const hit = this.itemAt(event.clientX, event.clientY);
        if (!hit) return;
        event.preventDefault();
        event.stopPropagation();
        this.selectedId = hit.id;
        const pointerPosition = new Vec3();
        if (!this.pointerOnPlane(hit.position[1], event, pointerPosition)) return;
        this.drag = {
            item: hit,
            moved: false,
            offsetX: hit.position[0] - pointerPosition.x,
            offsetZ: hit.position[2] - pointerPosition.z
        };
        this.updateStatus();
        this.updateOverlay();
    }

    private onPointerMove(event: PointerEvent) {
        if (!this.drag) return;
        event.preventDefault();
        event.stopPropagation();
        this.drag.moved = true;
        this.moveToPointer(this.drag.item, event, this.drag.offsetX, this.drag.offsetZ);
    }

    private onPointerUp(event: PointerEvent) {
        if (!this.drag) return;
        event.preventDefault();
        event.stopPropagation();
        const moved = this.drag.moved;
        this.drag = null;
        if (moved) this.markDirty();
    }

    private runAction(action?: string) {
        const item = this.items.find(candidate => candidate.id === this.selectedId);
        if (!item) return;
        const heightStep = Math.max(0.01, this.scene.camera.sceneRadius * 0.015);
        if (action === 'rotate-left') item.rotation -= 15;
        if (action === 'rotate-right') item.rotation += 15;
        if (action === 'scale-down') item.scale = clamp(item.scale - 0.1, 0.25, 3);
        if (action === 'scale-up') item.scale = clamp(item.scale + 0.1, 0.25, 3);
        if (action === 'lower') item.position[1] -= heightStep;
        if (action === 'raise') item.position[1] += heightStep;
        if (action === 'duplicate') {
            this.addModel(item.kind, {
                position: [item.position[0] + heightStep * 2, item.position[1], item.position[2]],
                rotation: item.rotation,
                scale: item.scale
            });
            return;
        }
        if (action === 'delete') {
            this.removeSelected();
            return;
        }
        this.applyTransform(item);
        this.markDirty();
        this.updateStatus();
        this.updateOverlay();
    }

    private removeSelected() {
        const index = this.items.findIndex(item => item.id === this.selectedId);
        if (index < 0) return;
        this.items[index].entity.destroy();
        this.items.splice(index, 1);
        this.selectedId = this.items[Math.max(0, index - 1)]?.id ?? null;
        this.markDirty();
        this.updateStatus();
        this.updateOverlay();
    }

    private updateStatus() {
        this.count.textContent = `${this.items.length} 件已摆放 · ${furnitureCatalog.length} 个模型`;
        this.hint.textContent = this.items.length ?
            '点中并按住模型拖动' : `${this.products?.childElementCount || furnitureCatalog.length} 个可用模型`;
        const selected = this.items.find(item => item.id === this.selectedId);
        if (this.scaleLabel) this.scaleLabel.textContent = `${Math.round((selected?.scale || 1) * 100)}%`;
    }

    private updateOverlay() {
        const selected = this.items.find(item => item.id === this.selectedId);
        const visible = this.open && Boolean(selected);
        this.selection.classList.toggle('visible', visible);
        this.controls.classList.toggle('visible', visible);
        if (!selected || !visible) return;
        workPosition.set(selected.position[0], selected.position[1], selected.position[2]);
        this.scene.camera.worldToScreen(workPosition, workScreen);
        const inFront = workScreen.z >= -1 && workScreen.z <= 1;
        this.selection.classList.toggle('visible', inFront);
        this.selection.style.left = `${workScreen.x * 100}%`;
        this.selection.style.top = `${workScreen.y * 100}%`;
        this.selection.style.setProperty('--furniture-ring-scale', `${clamp(selected.scale, 0.6, 1.8)}`);
        this.updateStatus();
    }

    private renderBounds() {
        if (!this.open) return;
        this.items.forEach((item) => {
            this.scene.app.drawWireAlignedBox(
                item.localBound.getMin(),
                item.localBound.getMax(),
                item.id === this.selectedId ? selectedBoundColor : furnitureBoundColor,
                true,
                undefined,
                item.scaleRoot.getWorldTransform()
            );
        });
    }

    private markDirty() {
        this.dirty = true;
        this.scene.forceRender = true;
    }

    private serialize(): FurnitureDocument {
        return {
            version: 1,
            items: this.items.map(item => ({
                id: item.id,
                kind: item.kind,
                position: [...item.position],
                rotation: item.rotation,
                scale: item.scale
            }))
        };
    }

    private async deserialize(data?: FurnitureDocument) {
        this.clear(false);
        if (!data?.items) return;
        for (const item of data.items) {
            if (catalogById.has(item.kind)) await this.addModel(item.kind, item, false);
        }
        this.dirty = false;
        this.updateStatus();
    }

    private clear(dirty: boolean) {
        this.items.forEach(item => item.entity.destroy());
        this.items = [];
        this.selectedId = null;
        this.dirty = dirty;
        this.updateStatus();
        this.updateOverlay();
        this.scene.forceRender = true;
    }
}

export { FurniturePlacement };
