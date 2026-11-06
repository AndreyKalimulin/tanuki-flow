import { DATA } from './data.js';
import { changeQuantity, totals, unitPrice, snapshot } from './model.js';
import { patch, motion, ease, reducedMotion, freezeMotion } from './ui.js';
import { captureBrand, morphBrand, animatePromotionPanel } from './brand-motion.js';

const $ = (s, root=document) => root.querySelector(s);
const screen=$('#screen'), overlay=$('#overlay'), phone=$('#phone');
const state={screen:'home',modal:null,mode:'delivery',cart:{},time:null,category:'Хиты',query:'',search:false,promos:'standard',totalExpanded:false,order:null,promoIndex:0};
const favourites=new Set(Object.values(DATA.products).filter(p=>p.favourite).map(p=>p.id));
// Status icons are needed on the first animated frame, before a cold request could finish.
for(const [name,src] of Object.entries(DATA.icons))if(name.startsWith('status-')){const preload=new Image();preload.src=src;}
const scrollPositions=new Map();
const dates=['Вт 25 авг.','Ср 26 авг.','Чт 27 авг.','Сегодня','Сб 29 авг.','Вс 30 авг.','Пн 31 авг.','Вт 1 сент.'];
let closing=false, lastModalRendered=null, closeTimer;
let draft, statusTimer, wheelTimers={}, orderNumber=254648, previousFocus, swipe=null;
const motionHost=document.createElement('div');
motionHost.id='motion-host';motionHost.setAttribute('aria-hidden','true');phone.append(motionHost);
const pageHost=document.createElement('div');pageHost.id='page-motion-host';pageHost.setAttribute('aria-hidden','true');phone.append(pageHost);
let renderedScreen=null, renderedSearch=false, lastStatus=null, storyGeneration=0,storyBusy=false,storyQueue=[];
const closedLayers=new WeakSet(),scrollControllers=new WeakMap();
function animateFinite(el,frames,options,onDone=()=>{}){return motion(el,frames,options,onDone);}
const fmt=n=>new Intl.NumberFormat('ru-RU').format(n);
const money=n=>`${fmt(n)} ₽`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const img=(src,cls='',alt='')=>`<img src="${src}" class="${cls}" alt="${esc(alt)}" draggable="false">`;
const icon=(key,cls='')=>img(DATA.icons[key],`icon ${cls}`);
const ci=name=>icon(Object.keys(DATA.icons).find(k=>k.startsWith(name)));
const homeAsset=name=>`assets/home/${name}`;
const btn=(action,label,content,cls='',extra='')=>`<button type="button" data-action="${action}" aria-label="${esc(label)}" class="${cls}" ${extra}>${content}</button>`;
const clock=t=>`${String(t?.hour??18).padStart(2,'0')}:${String(t?.minute??45).padStart(2,'0')}`;
function eta(mode=state.mode,time=state.time){return time?`${time.date===3?'':dates[time.date]+', '}${mode==='delivery'?'доставим к':'забрать в'} ${clock(time)}`:mode==='delivery'?'доставим к 18:45':'через 30 минут';}
function address(mode=state.mode){return mode==='delivery'?'Академика Лаврентьева, 11, кв. 77':'Тануки, Большой Златоустинский пер., 1, стр. 1';}
function statusBar(){return `<div class="reference-status" aria-hidden="true"><b>${state.screen==='cart'?'9:41':'12:22'}</b><div>${state.modal==='story'?DATA.promos[state.promoIndex].statusIcons.map(src=>img(src)).join(''):img(homeAsset('63f10.svg'))+img(homeAsset('7d931.svg'))+img(homeAsset('0ba7b.svg'))}</div></div>`;}
function segments(inCart=false){return `<div class="receiving ${inCart?'in-cart':''}">${btn('time','Выбрать время',img(homeAsset('2c942.svg'),'clock'),'clock-button')}<div class="segments">${['delivery','pickup'].map(mode=>btn('mode',mode==='delivery'?'Доставка':'С собой',`<span>${mode==='delivery'?'Доставка':'С собой'}</span><small>${mode==='pickup'&&state.mode!=='pickup'?'со скидкой 20%':eta(mode)}</small>`,state.mode===mode?'selected':'',`data-mode="${mode}" aria-pressed="${state.mode===mode}"`)).join('')}</div></div>`;}
function promotionPanel(){if(state.screen==='cart')return '';return `<section class="promotion-panel ${state.screen} ${state.promos}" aria-label="Акции"><button class="handle" data-action="promotion-height" data-drag="promos" aria-label="${state.promos==='expanded'?'Свернуть акции':'Раскрыть акции'}"><span></span></button><div class="promotion-scroll" data-scroll="promotions"><div class="stories-strip" data-scroll="stories">${DATA.promos.map((p,i)=>btn('story',`Сторис: ${p.title}`,img(p.thumb,'story-thumb',p.title),'story-thumb-button',`data-index="${i}"`)).join('')}</div><div class="banners">${DATA.promos.map((p,i)=>btn('promo',`Акция: ${p.title}`,img(p.banner,'banner',p.title),'banner-button',`data-index="${i}"`)).join('')}</div></div></section>`;}
function home(){return `<div class="page home-page ${state.promos==='expanded'?'promos-expanded':''} ${state.order?'with-order':''}">${statusBar()}<div class="home-scroll" data-scroll="home"><div class="profile"><div class="person"><span class="avatar-frame">${img(homeAsset('e3cbe.png'),'avatar','Константин')}</span><span>Константин</span></div><div class="balance">3500 ${img(homeAsset('68595.svg'))}</div></div>${segments()}${btn('address-home','Адрес',`<span>${state.mode==='delivery'?'Ул. Академика Лаврентьева, 11': 'Выберите ресторан на карте'}</span>${img(homeAsset('a4f0f.svg'),'icon')}`,'home-address')}${state.order?btn('order','Открыть заказ',`${img(homeAsset('afeba.svg'),'widget-logo')}<b>${orderTitle(state.order)}</b>${img(homeAsset('0b66f.svg'),'icon')}`,'order-widget'):''}<div class="brands">${[['Тануки','От 45 мин. и 950 ₽','fd964.svg','tanuki'],['ТВОЯ ПИЦЦА','От 20 мин. и 800 ₽','011b7.svg','pizza'],['Ёрш','Только с собой','56d21.svg','ersh'],['Каспийка','Только с собой','b13f7.svg','kaspiy']].map(([name,caption,file,cls])=>`<${cls==='tanuki'?'button':'div'} ${cls==='tanuki'?'type="button" data-action="brand" aria-label="Открыть Тануки"':''} class="brand ${cls}" id="brand-${cls}">${img(homeAsset(file),'brand-logo',name)}${img('assets/compact/'+({tanuki:state.order?'ed218.svg':'175fd.svg',pizza:state.order?'bb6ac.svg':'64918.svg',ersh:state.order?'23f79.svg':'2333f.svg',kaspiy:'84107.svg'})[cls],'compact-logo')}<span>${state.promos==='expanded'?({tanuki:'Суши и роллы',pizza:'Пицца',ersh:'Мясо и гриль',kaspiy:'Море рыбы'})[cls]:caption}</span>${cls==='ersh'?'<small class="pickup-badge">С собой</small>':''}</${cls==='tanuki'?'button':'div'}>`).join('')}</div></div>${promotionPanel()}</div>`;}
function priceMarkup(p,mode=state.mode){const price=unitPrice(p,mode);return `<b>${money(price)}</b>${price<p.price?`<s>${money(p.price)}</s>`:''}`;}
function quantityControl(p,kind='card'){const n=state.cart[p.id]||0;
  if(kind==='card')return `<div class="quantity card ${n?'filled':'empty'}">${btn('quantity',`Убрать ${p.title}`,icon(n===1?'delete':'minus'),'quantity-minus',`data-key="minus" data-id="${p.id}" data-delta="-1" ${n?'':'disabled'}`)}${btn('quantity',n?`Цена ${p.title}`:`Добавить ${p.title}`,money(unitPrice(p,state.mode)),'quantity-price',`data-key="price" data-id="${p.id}" data-delta="1" ${n?'disabled aria-hidden="true"':''}`)}<span class="quantity-count" data-key="count" aria-label="Количество ${esc(p.title)}">${n||''}</span>${btn('quantity',`Добавить ${p.title}`,icon('add'),'quantity-plus',`data-key="plus" data-id="${p.id}" data-delta="1"`)}</div>`;
  return n?`<div class="quantity ${kind}">${btn('quantity',`Убрать ${p.title}`,icon(n===1&&kind==='card'?'delete':'minus'),'quantity-minus',`data-id="${p.id}" data-delta="-1"`)}<span aria-label="Количество ${esc(p.title)}">${n}</span>${btn('quantity',`Добавить ${p.title}`,icon('add'),'quantity-plus',`data-id="${p.id}" data-delta="1"`)}</div>`:btn('quantity',`Добавить ${p.title}`,`${money(unitPrice(p,state.mode))}${kind==='recommendation'?'':icon('add')}`,'add-price',`data-id="${p.id}" data-delta="1"`);}
function productCard(p,slot){return `<article class="product-card ${(state.cart[p.id]||0)?'has-quantity':''}" data-product="${p.id}" data-key="${p.id}:${slot}"><div class="product-photo">${img(p.image,'product-image',p.title)}${p.hit?'<b class="hit">Хит</b>':''}</div><div class="product-content"><div class="product-name"><span>${esc(p.title)}</span>${btn('favourite',`Избранное: ${p.title}`,icon(favourites.has(p.id)?'favouriteOn':'favouriteOff'),'favourite',`data-id="${p.id}" aria-pressed="${favourites.has(p.id)}"`)}</div>${p.rating?`<div class="rating"><b>${String(p.rating).replace('.',',')}</b><div class="stars">${p.stars.map(s=>img(s)).join('')}</div><span>${p.reviews}</span></div>`:'<div class="rating"></div>'}</div>${quantityControl(p)}</article>`;}
function filteredIds(){let ids=DATA.slots;if(state.category==='Избранное')ids=ids.filter(id=>favourites.has(id));if(state.category==='Роллы')ids=ids.filter(id=>DATA.products[id].title.includes('Ролл'));if(state.category==='Димсамы')ids=ids.filter(id=>id==='duck-gyoza');if(state.search&&state.query.trim()){const q=state.query.toLocaleLowerCase('ru').trim();ids=ids.filter(id=>DATA.products[id].title.toLocaleLowerCase('ru').includes(q));}return ids;}
function grid(){const ids=filteredIds();return ids.length?ids.map((id,i)=>productCard(DATA.products[id],i)).join(''):'<p class="empty-search">Ничего не нашлось</p>';}
function catalog(){const t=totals(state.cart,state.mode);return `<div class="page catalog-page ${state.search?'searching':''}">${statusBar()}<header class="navbar">${btn(state.search?'search-close':state.promos==='expanded'?'promotion-standard':'home','Назад',icon(state.search?'searchBack':'back'),'nav-left')}${state.search?`<div class="search-field">${icon('searchLogo')}<input id="search" type="search" inputmode="search" enterkeyhint="search" placeholder="" value="${esc(state.query)}" aria-label="Поиск по меню" autocomplete="off">${btn('search-close','Закрыть поиск',icon('closeSearch'),'search-clear')}</div>`:t.quantity?btn('cart','Открыть корзину',`${icon('cartBrandLogo')}<b>корзина</b><span>${money(t.food)}</span>`,'catalog-cart'):`${icon('logo','center-logo')}`}<div class="nav-right">${state.search?'':'<span class="icon-button">'+icon('message')+'</span>'+btn('search-open','Поиск',icon('search'),'icon-button')}</div></header><div class="suggestions ${state.search?'shown':''}">${DATA.suggestions.map(s=>btn('suggestion',s,s,'suggestion',`data-query="${esc(s)}"`)).join('')}</div><section class="catalog-surface"><div class="categories">${btn('category','Избранное',icon('categoryFavourite'),'category-favourites',`data-category="Избранное"`)}<div class="category-scroll" data-scroll="categories">${DATA.categories.map(c=>btn('category',c,c,state.category===c?'category selected':'category',`data-category="${c}" aria-pressed="${state.category===c}"`)).join('')}</div></div><div class="product-grid" data-scroll="catalogue">${grid()}</div></section>${promotionPanel()}</div>`;}
function cartRows(){return Object.entries(state.cart).map(([id,n])=>{const p=DATA.products[id];return `<article class="cart-row" data-product="${id}">${img(p.image,'cart-photo',p.title)}<div class="cart-product"><span>${esc(p.title)}</span><div class="cart-price">${priceMarkup(p)}</div></div>${quantityControl(p,'cart')}</article>`;}).join('');}
function condiments(){return `<div class="condiments"><div><b>С заказом</b><small>Бесплатно</small></div><div class="condiment-pictures">${['condiment-wasabi','condiment-soy-sauce','condiment-ginger'].map(key=>ci(key)).join('')}<span>${ci('icon-lchopsticks')}</span></div>${ci('icon-mchevron-right')}</div>`;}
function cart(){const t=totals(state.cart,state.mode);return `<div class="page cart-page">${statusBar()}<header class="navbar">${btn('catalog','Назад в меню',icon('back'),'nav-left')}<h1>${ci('logo-tanuki')}Корзина</h1>${btn('clear-cart','Очистить корзину',ci('icon-sdelete'),'nav-right icon-button')}</header><div class="cart-scroll" data-scroll="cart"><section class="cart-section receiving-section">${segments(true)}<div class="cart-address ${state.time?'scheduled':''}">${state.time?ci('icon-shome'): ''}<span>${address()}</span>${ci('icon-mchevron-right')}</div></section>${t.quantity?`<section class="cart-section items-section">${cartRows()}${condiments()}</section><section class="cart-section totals-section ${state.totalExpanded?'expanded':''}"><div class="option-row">${ci('icon-sgift')}<span>Скидки и промокоды</span>${ci('icon-schevron-right-')}</div><div class="option-row payment"><span class="pay-wordmark">${ci('icon-3808f')}${ci('text-edeb1')}</span><span>Яндекс Пэй</span>${ci('icon-schevron-right-')}</div>${btn('total-expand','Расшифровка суммы',`<b>Итого</b><b>${money(t.total)} ${ci('icon-chevron-down')}</b>`,'total-heading',`aria-expanded="${state.totalExpanded}"`)}<div class="total-breakdown ${state.totalExpanded?'expanded':''}" aria-hidden="${!state.totalExpanded}"><div><span>Стоимость заказа</span><span>${t.discount?`<s>${money(t.original)}</s> `:''}${money(t.food)}</span></div><div><span>Бонусы</span><span class="bonus">+${fmt(t.bonus)} ${ci('loyalty-heart')}</span></div><div><span>Доставка</span><span>${money(t.delivery)}</span></div></div></section><section class="recommendations"><h2>Добавим к заказу?</h2><div class="recommendation-scroll" data-scroll="recommendations">${DATA.recommendations.map(id=>{const p=DATA.products[id];return `<article class="recommendation">${img(p.image,'recommendation-photo',p.title)}<span>${esc(p.title)}</span>${quantityControl(p,'recommendation')}</article>`;}).join('')}</div></section>`:'<section class="cart-section empty-cart"><h2>В корзине пока пусто</h2>'+btn('catalog','Перейти в меню','Перейти в меню','primary')+'</section>'}</div>${t.quantity?`<footer class="pay-footer">${btn('pay','Оплатить',`<span>Оплатить</span><b>${money(t.total)}</b>`,'primary pay-button')}</footer>`:''}</div>`;}
function orderTitle(o){return ({accepted:'Принят',cooking:'Готовится',transit:o.mode==='pickup'?'Готов к выдаче':'Доставляем',delivered:o.mode==='pickup'?'Выдан':'Доставлен',cancelled:'Отменен'})[o.status];}
function progress(o){const stages=['accepted','cooking','transit'],index=stages.indexOf(o.status),name=({accepted:'status-accepted',cooking:'status-cooking',transit:'status-transit',delivered:'status-delivered',cancelled:'status-cancelled'})[o.status];return `<div class="progress ${o.status}">${index>=0?'<div class="progress-rail">'+[0,1,2,3].map(i=>'<span></span>').join('')+'</div><div class="progress-fill"></div>':''}<div class="progress-marker">${ci(name)}</div></div>`;}
function orderRows(o){return Object.entries(o.cart).map(([id,n],index)=>{const p=DATA.products[id];return `<div class="order-row" data-key="${id}" style="--row-end:-${112+index*72}px"><div class="order-product-image">${img(p.image,'cart-photo',p.title)}<b>${n}</b></div><strong>${esc(p.title)}</strong><div class="order-price">${unitPrice(p,o.mode)<p.price?`<s>${money(p.price*n)}</s>`:''}<b>${money(unitPrice(p,o.mode)*n)}</b></div></div>`;}).join('');}
function orderModal(){const o=state.order,t=o.totals,expanded=o.details&&state.modal!=='cancel',finished=['cancelled','delivered'].includes(o.status);let subtitle=o.status==='cancelled'?'по вашей инициативе':o.status==='delivered'?(o.time?`${dates[o.time.date]} в ${clock(o.time)}`:'3 сентября в 18:46'):o.status==='transit'?`${o.mode==='pickup'?'можно забрать':'будем'} к ${clock(o.time)}${o.mode==='delivery'?', в интервале 15 минут':''}`:eta(o.mode,o.time);return `<div class="modal-layer order-layer"><button class="backdrop" data-action="modal-close" aria-label="Закрыть заказ"></button><section class="modal-sheet order-sheet" data-status="${o.status}" role="dialog" aria-modal="true" aria-label="Статус заказа"><button class="outside-handle" data-action="modal-close" data-drag="modal" aria-label="Закрыть заказ"><span></span></button><div class="order-content" data-scroll="order-content"><section class="order-header"><div class="order-top">${ci('order-tanuki-logo')}<span class="order-close">${ci('order-chat-984d0')}</span></div><div class="order-number"># ${o.number} ${ci('order-copy-number')}</div><h2>${orderTitle(o)}</h2><p>${subtitle}</p>${progress(o)}</section><section class="order-body ${expanded?'details-expanded':''}"><div class="order-scroll" data-scroll="order"><div class="order-food">${orderRows(o)}</div><div class="order-row" data-key="delivery">${ci('order-delivery-tile')}<strong>${o.mode==='pickup'?'С собой':'Доставка'}</strong><b>${money(t.delivery)}</b></div><div class="order-row" data-key="bonus"><span class="order-bonus-image">${ci('order-bonus-tile')}</span><strong>Бонусы</strong><b class="bonus">+${fmt(t.bonus)} ${ci('loyalty-heart')}</b></div>${ci('order-divider')}<div class="order-total"><b>Итого</b><b>${money(t.total)}</b></div>${btn('order-details','Детали заказа',`<b>Детали заказа</b>${ci('order-details-chevron')}`,'order-details',`aria-expanded="${expanded}"`)}<div class="order-fields" ${expanded?'':'inert'}><div><small>Способ оплаты</small><span class="order-payment">Картой •••• 1234 ${img('assets/cart/order-mastercard.svg')}</span></div><div><small>${o.mode==='pickup'?'Ресторан':'Доставка'}</small><span>${o.mode==='pickup'?address(o.mode):'ул. Садовая, д.7, стр.3, этаж 5, кв.30'}</span></div><div><small>Комментарий</small><span>Вход в БЦ с торца, позвонить за 10 минут</span></div>${!finished&&o.status!=='accepted'?btn('cancel-open','Отменить заказ','Отменить заказ','secondary'):''}</div></div></section></div><footer class="modal-footer order-footer ${finished||o.status==='accepted'?'':'absent'}" aria-hidden="${!finished&&o.status!=='accepted'}" ${!finished&&o.status!=='accepted'?'inert':''}>${btn(finished?'repeat':'cancel-open',finished?'Повторить заказ':'Отменить заказ',finished?'Повторить заказ':'Отменить заказ',finished?'primary':'secondary')}</footer></section></div>`;}
function timeModal(){return `<div class="modal-layer time-layer"><button class="backdrop" data-action="modal-close" aria-label="Закрыть выбор времени"></button><section class="modal-sheet time-sheet" role="dialog" aria-modal="true" aria-label="Выбор времени"><button class="handle time-handle" data-action="modal-close" data-drag="modal" aria-label="Закрыть выбор времени"><span></span></button><h2>${state.mode==='delivery'?'Запланировать доставку':state.screen==='cart'?'Выбрать время':'Забрать из ресторана'}</h2><div class="time-picker"><div class="selection-band"></div>${['date','hour','minute'].map(key=>`<div class="wheel ${key}" tabindex="0" role="listbox" aria-label="${({date:'Дата',hour:'Часы',minute:'Минуты'})[key]}" data-wheel="${key}">${wheelItems(key)}</div>`).join('')}</div><footer class="modal-footer">${btn('time-apply','Подтвердить время',state.screen==='cart'?'Подтвердить':'Выбрать','primary')}</footer></section></div>`;}
function wheelCount(key){return key==='date'?8:key==='hour'?24:12;}
function wheelItems(key){const values=key==='date'?dates:Array.from({length:wheelCount(key)},(_,i)=>String(key==='minute'?i*5:i).padStart(2,'0')),ticks=key==='date'?['Пн 24 авг.',...values]:Array.from({length:5},()=>values).flat();return ticks.map((text,i)=>`<button type="button" class="wheel-tick" role="option" tabindex="-1" data-action="wheel-value" data-key="${key}" data-value="${key==='date'?i-1:key==='minute'?(i%12)*5:i%wheelCount(key)}" ${key==='date'&&i===0?'disabled aria-hidden="true"':''} aria-selected="false">${text}</button>`).join('');}
function promoModal(){const p=DATA.promos[state.promoIndex];return `<div class="modal-layer promo-layer"><button class="backdrop" data-action="modal-close" aria-label="Закрыть акцию"></button><section class="modal-sheet promo-sheet" role="dialog" aria-modal="true" aria-label="${esc(p.title)}"><button class="outside-handle" data-action="modal-close" data-drag="modal" aria-label="Закрыть акцию"><span></span></button><div class="promo-content" data-scroll="promo-detail">${img(p.banner,'banner',p.title)}<h2>${esc(p.texts[0])}</h2>${p.texts.slice(1,-1).map((text,i)=>text==='SKID15'?`<div class="promo-code"><small>Промокод</small><b>${text}</b></div>`:text==='Промокод'?'':`<p class="${state.promoIndex===3&&i>0?'fine-print':''}">${esc(text)}</p>`).join('')}</div>${btn('modal-close','Закрыть акцию',img(p.modalClose,'icon'),'round-close')}<footer class="modal-footer"><div class="primary visual-cta" aria-disabled="true">${esc(p.texts.at(-1))}</div></footer></section></div>`;}
function storyModal(){const p=DATA.promos[state.promoIndex];return `<section class="story-view" role="dialog" aria-modal="true" aria-label="Сторис: ${esc(p.title)}">${statusBar()}${img(p.story,'story-creative',p.title)}${btn('modal-close','Закрыть сторис',img(p.storyClose,'icon'),'story-close')}${btn('story-prev','Предыдущая сторис','','story-zone previous')}${btn('story-next','Следующая сторис','','story-zone next')}</section>`;}
function cancelModal(){const status=state.order.status,pickup=state.order.mode==='pickup',title=status==='accepted'?'Точно отменяем заказ?':status==='cooking'?'Заказ уже готовят':pickup?'Заказ готов к выдаче':'Заказ уже в пути';return `<div class="cancel-layer"><button class="backdrop" data-action="cancel-close" aria-label="Закрыть отмену заказа"></button><section class="modal-sheet cancel-sheet" role="dialog" aria-modal="true" aria-label="${title}"><button class="outside-handle" data-action="cancel-close" data-drag="cancel" aria-label="Закрыть отмену заказа"><span></span></button><div class="cancel-content"><h2>${title}</h2><h3 class="${status==='accepted'?'green':'red'}">${status==='accepted'?'Бесплатная отмена':status==='cooking'&&!pickup?'Вернем только стоимость доставки':'При отмене деньги не вернутся'}</h3><p>${status==='accepted'?'Ресторан еще не начал готовить, поэтому вернем всю сумму. Если заказ был оплачен, деньги придут в течение 10 дней':status==='cooking'?(pickup?'Повара уже начали готовить ваш заказ.':'Повара уже начали готовить, сможем вернуть только стоимость доставки.'):(pickup?'Заказ готов и ожидает вас в ресторане.':'Курьер скоро будет у вас.')}</p>${status!=='accepted'?'<p>Если есть вопросы по заказу, напишите нам — мы с радостью поможем</p>':''}</div><footer class="cancel-buttons">${btn('cancel-confirm','Да, отменить','Да, отменить','secondary')}${btn('cancel-close','Не отменять','Не отменять','primary')}</footer></section></div>`;}

function captureScroll(root){root.querySelectorAll('[data-scroll]').forEach(el=>scrollPositions.set(el.dataset.scroll,[el.scrollTop,el.scrollLeft]));}
function restoreScroll(root){root.querySelectorAll('[data-scroll]').forEach(el=>{const pos=scrollPositions.get(el.dataset.scroll);if(pos){el.scrollTop=pos[0];el.scrollLeft=pos[1];}});}
function orderScroller(){
  const content=$('.order-content',overlay);
  return content&&getComputedStyle(content).display!=='contents'?content:$('.order-scroll',overlay);
}
function pageHtml(){return state.screen==='home'?home():state.screen==='catalog'?catalog():cart();}
function overlayHtml(){return ['order','cancel'].includes(state.modal)?orderModal()+(state.modal==='cancel'?cancelModal():''):state.modal==='time'?timeModal():state.modal==='promo'?promoModal():state.modal==='story'?storyModal():'';}
function layerKey(el){return el.classList[0]==='modal-layer'?el.classList[1]:el.classList[0];}
function modalDuration(kind,entry=false){return kind==='time'?entry?400:300:kind==='promo'?320:kind==='story'?entry?180:0:kind==='cancel'?state.order?.status==='transit'?entry?380:300:350:entry?380:280;}
function enterLayer(layer,kind){
  const sheet=layer.matches('.story-view')?layer:$('.modal-sheet',layer),duration=modalDuration(kind,true);
  animateFinite(sheet,kind==='story'?[{opacity:0},{opacity:1}]:[{transform:'translateY(100%)'},{transform:'translateY(0)'}],{duration,easing:kind==='story'?'ease-out':ease});
  animateFinite($('.backdrop',layer),[{opacity:0},{opacity:1}],{duration,easing:kind==='story'?'ease-out':ease});
}
function leaveLayer(layer,kind,duration=modalDuration(kind),dissolve=false,easing=ease){
  const sheet=layer.matches('.story-view')?layer:$('.modal-sheet',layer);
  layer.inert=true;
  const pose=sheet?getComputedStyle(sheet).transform:'none';
  return Promise.all([
    animateFinite(sheet,kind==='story'||dissolve?[{opacity:getComputedStyle(sheet).opacity},{opacity:0}]:[{transform:pose},{transform:`translateY(${sheet.offsetHeight+48}px)`}],{duration,easing,fill:'forwards'}),
    animateFinite($('.backdrop',layer),[{opacity:1},{opacity:0}],{duration,easing,fill:'forwards'})
  ]);
}
function render({onlyOverlay=false}={}){
  if(!state.order&&['order','cancel'].includes(state.modal)){state.modal=null;history.replaceState(view(),'');}
  else if(state.modal==='cancel'&&['cancelled','delivered'].includes(state.order.status)){state.modal='order';history.replaceState(view(),'');}
  const oldFood=$('.order-food',overlay),oldFields=$('.order-fields',overlay),oldOrderBody=$('.order-body',overlay);
  const detailPose=oldFood&&oldFields?{food:oldFood.getBoundingClientRect().height,rows:[...oldFood.children].map(row=>getComputedStyle(row).transform),fields:oldFields.getBoundingClientRect().height,expanded:oldOrderBody.classList.contains('details-expanded'),paddingTop:getComputedStyle(oldFields).paddingTop,paddingBottom:getComputedStyle(oldFields).paddingBottom,scroll:orderScroller().scrollTop}:null;
  const statusPose=state.order?.status!==lastStatus?captureStatusPose():null;
  const pageChanged=renderedScreen!==state.screen,searchChanged=renderedSearch!==state.search;
  if(!onlyOverlay){
    captureScroll(screen);
    if(pageChanged){screen.innerHTML=pageHtml();restoreScroll(screen);}
    else patch(screen,pageHtml());
    if(searchChanged&&!pageChanged){
      const field=$('.search-field',screen);
      if(field)animateFinite(field,[{opacity:0,transform:'translateX(12px)'},{opacity:1,transform:'translateX(0)'}],{duration:320});
    }
    renderedScreen=state.screen;renderedSearch=state.search;
  }
  const template=document.createElement('template');template.innerHTML=overlayHtml();
  const desired=[...template.content.children],old=[...overlay.children];
  for(const layer of old){
    if(!desired.some(n=>layerKey(n)===layerKey(layer))){
      if(closedLayers.has(layer)){layer.remove();continue;}
      motionHost.append(layer);layer.inert=true;
      leaveLayer(layer,layer.classList.contains('story-view')?'story':layerKey(layer).split('-')[0]).then(()=>layer.remove());
    }
  }
  for(const next of desired){
    let current=[...overlay.children].find(n=>layerKey(n)===layerKey(next));
    if(current){const holder=document.createElement('div');holder.append(next);patch(current,next.innerHTML);for(const attr of [...next.attributes])current.setAttribute(attr.name,attr.value);}
    else {current=next;overlay.append(current);enterLayer(current,layerKey(current).split('-')[0]);if(current.classList.contains('time-layer')){bindWheels();pickerObserver.observe($('.time-picker',current));}}
    current.inert=state.modal==='cancel'&&current.classList.contains('order-layer');
  }
  if(detailPose&&oldOrderBody?.isConnected&&detailPose.expanded!==oldOrderBody.classList.contains('details-expanded'))animateDetails(detailPose);
  screen.inert=!!state.modal;
  lastModalRendered=state.modal;
  const newStatus=state.order?.status;
  if(statusPose&&['order','cancel'].includes(state.modal))animateStatusPose(statusPose,newStatus==='cancelled'?200:350,newStatus);
  lastStatus=newStatus;
}
function captureStatusPose(){
  const header=$('.order-header',overlay);if(!header)return null;
  const origin=header.getBoundingClientRect();
  const text=[...header.querySelectorAll('h2:not(.status-outgoing),p:not(.status-outgoing)')].map(el=>{const rect=el.getBoundingClientRect();return {old:el.cloneNode(true),tag:el.tagName.toLowerCase(),top:rect.top-origin.top,left:rect.left-origin.left,width:rect.width,height:rect.height};});
  const fill=$('.progress-fill',header),style=fill&&getComputedStyle(fill),icon=$('.progress-marker img:not(.status-outgoing)',header),rect=icon?.getBoundingClientRect();
  const progress=$('.progress',header),progressRect=progress.getBoundingClientRect(),oldProgress=progress.cloneNode(true);
  for(const old of oldProgress.querySelectorAll('.status-outgoing'))old.remove();
  const oldFill=$('.progress-fill',oldProgress);if(oldFill&&fill)oldFill.style.width=getComputedStyle(fill).width;
  const oldMarker=$('.progress-marker',oldProgress),marker=$('.progress-marker',progress);Object.assign(oldMarker.style,{left:getComputedStyle(marker).left,backgroundColor:getComputedStyle(marker).backgroundColor});
  return {header,text,progress:{old:oldProgress,top:progressRect.top-origin.top,left:progressRect.left-origin.left,width:progressRect.width,height:progressRect.height},fill:style?{backgroundImage:style.backgroundImage,backgroundColor:style.backgroundColor}:null,icon:icon?{old:icon.cloneNode(),width:rect.width,height:rect.height}:null};
}
function animateStatusPose(pose,duration,status){
  if(!pose.header.isConnected)return;
  for(const item of pose.text){
    item.old.classList.add('status-outgoing');item.old.setAttribute('aria-hidden','true');
    Object.assign(item.old.style,{position:'absolute',left:`${item.left}px`,top:`${item.top}px`,width:`${item.width}px`,height:`${item.height}px`,margin:'0',pointerEvents:'none'});pose.header.append(item.old);
    animateFinite(item.old,[{opacity:1},{opacity:0}],{duration},()=>item.old.remove());
    animateFinite($(item.tag,pose.header),[{opacity:0},{opacity:1}],{duration});
  }
  if(status==='cancelled'){
    const current=$('.progress',pose.header),marker=$('.progress-marker',current),item=pose.progress;marker.style.transition='none';
    item.old.classList.add('status-outgoing');item.old.setAttribute('aria-hidden','true');Object.assign(item.old.style,{position:'absolute',left:`${item.left}px`,top:`${item.top}px`,width:`${item.width}px`,height:`${item.height}px`,pointerEvents:'none'});pose.header.append(item.old);
    animateFinite(item.old,[{opacity:1},{opacity:0}],{duration},()=>item.old.remove());animateFinite(current,[{opacity:0},{opacity:1}],{duration},()=>marker.style.transition='');return;
  }
  const fill=$('.progress-fill',pose.header);
  if(fill&&pose.fill){const old=document.createElement('span');old.className='status-outgoing';Object.assign(old.style,{position:'absolute',inset:'0',borderRadius:'inherit',pointerEvents:'none',...pose.fill});fill.append(old);animateFinite(old,[{opacity:1},{opacity:0}],{duration},()=>old.remove());}
  const marker=$('.progress-marker',pose.header),current=$('img',marker);
  if(marker&&pose.icon){const old=pose.icon.old;old.classList.add('status-outgoing');old.setAttribute('aria-hidden','true');Object.assign(old.style,{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:`${pose.icon.width}px`,height:`${pose.icon.height}px`,pointerEvents:'none'});marker.append(old);animateFinite(old,[{opacity:1},{opacity:0}],{duration},()=>old.remove());animateFinite(current,[{opacity:0},{opacity:1}],{duration});}
}
function view(){return {screen:state.screen,modal:state.modal,search:state.search,promoIndex:state.promoIndex,orderId:state.order?.number};}
function route(values,replace=false){Object.assign(state,values);history[replace?'replaceState':'pushState'](view(),'');render();}
history.replaceState(view(),'');
window.addEventListener('popstate',e=>{
  finishDrag(true);
  clearTimeoutsForWheels();clearTimeout(closeTimer);const old=state.modal;closing=false;
  if(old==='story'||e.state?.modal==='story'){storyGeneration++;storyBusy=false;storyQueue=[];}
  Object.assign(state,e.state??{screen:'home',modal:null,search:false});
  if(['order','cancel'].includes(state.modal)&&e.state?.orderId!==state.order?.number)state.modal=null;
  if(state.modal==='time')draft={...(state.time??{date:3,hour:18,minute:45})};
  if(old==='order'&&!state.modal&&state.order)state.order.details=false;
  render();if(old&&!state.modal||old==='cancel'&&state.modal==='order')restoreFocus();scheduleStatus();
});
function restoreFocus(){
  if(previousFocus?.isConnected&&!previousFocus.closest('[inert]'))previousFocus.focus({preventScroll:true});
  else {const label=previousFocus?.getAttribute('aria-label'),action=previousFocus?.dataset.action;[...screen.querySelectorAll('button')].find(b=>b.dataset.action===action&&b.getAttribute('aria-label')===label)?.focus({preventScroll:true});}
}
function openModal(modal,index=0){
  if(closing||(['order','cancel'].includes(modal)&&!state.order))return;
  previousFocus=document.activeElement;
  if(modal==='story'){storyGeneration++;storyBusy=false;storyQueue=[];}
  if(modal==='time')draft={...(state.time??{date:3,hour:18,minute:45})};
  if(modal==='order'){state.order.details=false;if(state.order.status==='transit')state.order.status='delivered';}
  route({modal,promoIndex:index});
  requestAnimationFrame(()=>$('.cancel-layer [data-drag],.modal-sheet [data-drag],.story-close',overlay)?.focus({preventScroll:true}));
  scheduleStatus();
}
async function closeModal({confirm=false,easing=ease}={}){
  if(!state.modal||closing)return;closing=true;clearTimeoutsForWheels();if(state.modal==='story'){storyGeneration++;storyQueue=[];storyBusy=false;}
  const kind=state.modal,layer=kind==='cancel'?$('.cancel-layer',overlay):overlay.firstElementChild;
  const duration=confirm?200:modalDuration(kind);
  if(confirm&&state.order){const statusPose=captureStatusPose();clearTimeout(statusTimer);state.order.status='cancelled';state.order.details=false;
    const order=$('.order-layer',overlay);if(order)patch(order,(()=>{const t=document.createElement('template');t.innerHTML=orderModal();return t.content.firstElementChild.innerHTML;})());
    if(statusPose)animateStatusPose(statusPose,200,'cancelled');lastStatus='cancelled';
  }
  await leaveLayer(layer,kind,duration,confirm,easing);layer.style.visibility='hidden';closedLayers.add(layer);
  if(closing&&state.modal===kind)history.back();
}
function flyBrand(from,to,duration,reverse=false,done=()=>{}){
  if(!from||!to){done();return;}
  return morphBrand(from,to,{host:motionHost,base:phone.getBoundingClientRect(),duration,onDone:done});
}
function navigate(to){
  if(to===state.screen&&!state.search)return;
  const old=state.screen,oldPage=screen.firstElementChild;
  const from=captureBrand(old==='home'?$('#brand-tanuki',screen):$('.center-logo,.catalog-cart>.icon',screen));
  captureScroll(screen);
  // Source navigation resets the incoming screen after capturing the outgoing
  // one. Shared promotion keys must not restore a scrolled home feed in catalog.
  state.promos='standard';for(const key of ['catalogue','promotions','stories'])scrollPositions.set(key,[0,0]);
  oldPage.inert=true;pageHost.append(oldPage);
  route({screen:to,modal:null,search:false});const next=screen.firstElementChild;
  const brand=(old==='home'&&to==='catalog')||(old==='catalog'&&to==='home'),duration=old==='home'?380:320;
  if(brand){
    animateFinite(oldPage,[{opacity:1},{opacity:0}],{duration,fill:'forwards'},()=>oldPage.remove());
    animateFinite(next,[{opacity:0},{opacity:1}],{duration});
    if(to==='catalog')animateFinite($('.catalog-surface',next),[{transform:'translateY(12px)'},{transform:'translateY(0)'}],{duration});
    else animateFinite($('.catalog-surface',oldPage),[{transform:'translateY(0)'},{transform:'translateY(12px)'}],{duration,fill:'forwards'});
    const targetNode=to==='home'?$('#brand-tanuki',screen):$('.center-logo,.catalog-cart>.icon',screen);
    flyBrand(from,captureBrand(targetNode,true),duration,to==='home');
    const addressNode=$('.home-address',to==='home'?next:oldPage);
    if(addressNode)animateFinite(addressNode,to==='home'?[{transform:'translateY(-88px)',opacity:0},{transform:'translateY(0)',opacity:1}]:[{transform:'translateY(0)',opacity:1},{transform:'translateY(-88px)',opacity:0}],{duration});
  }else if(to==='cart'){
    next.style.zIndex=1;animateFinite(next,[{transform:'translateX(100%)'},{transform:'translateX(0)'}],{duration:320}).then(()=>{next.style.zIndex='';oldPage.remove();});
  }else if(old==='cart'){
    pageHost.style.zIndex='2';oldPage.style.zIndex=1;animateFinite(oldPage,[{transform:'translateX(0)'},{transform:'translateX(100%)'}],{duration:320,fill:'forwards'}).then(()=>{oldPage.remove();pageHost.style.zIndex='';});
  }else {animateFinite(oldPage,[{opacity:1},{opacity:0}],{duration:320,fill:'forwards'},()=>oldPage.remove());animateFinite(next,[{opacity:0},{opacity:1}],{duration:320});}
}
function scheduleStatus(){
  clearTimeout(statusTimer);const o=state.order;
  if(!o||o.details||state.modal==='cancel'||!['accepted','cooking'].includes(o.status))return;
  statusTimer=setTimeout(()=>{if(state.order!==o)return;o.status=o.status==='accepted'?'cooking':'transit';
    // Patch only the existing order or home widget. An unrelated picker/story stays alive.
    if(['order','cancel'].includes(state.modal))render({onlyOverlay:true});
    else {const widget=$('.order-widget b',screen);if(widget)widget.textContent=orderTitle(o);}
    scheduleStatus();
  },1500);
}
function setPromotionPosition(position){
  const old=state.promos;if(old===position)return;
  const brands=[...screen.querySelectorAll('.brand')],first=brands.map(el=>captureBrand(el));
  for(const pose of first)pose.owner?.cancel();
  const panel=$('.promotion-panel',screen),panelPose=animatePromotionPanel(panel);
  if(panel){panel.style.transition='none';panel.style.height='';panel.style.transform='';}
  state.promos=position;render();$('.promotion-scroll',screen)?.scrollTo({top:0});$('.stories-strip',screen)?.scrollTo({left:0});
  const duration=position==='expanded'?420:position==='minimum'?280:320;
  animatePromotionPanel(panel,panelPose,duration);
  for(let i=0;i<brands.length;i++){
    const last=captureBrand(brands[i],true);if(!first[i].background.width||!last.background.width)continue;
    flyBrand(first[i],last,duration);
  }
}
function clearTimeoutsForWheels(){for(const id of Object.values(wheelTimers))clearTimeout(id);wheelTimers={};for(const controller of activeWheelControllers)controller.cancel();activeWheelControllers.clear();}
const wheelControllers=new WeakMap(),activeWheelControllers=new Set();
function sourceCurve(x){
  // Solve x(t) for the source Bézier (.22,1,.36,1), then evaluate y(t).
  const component=(t,a,b)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
  let lo=0,hi=1;for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(component(mid,.22,.36)<x)lo=mid;else hi=mid;}
  return component((lo+hi)/2,1,1);
}
function moveWheel(wheel,top,onDone=()=>{}){
  if(!overlay.contains(wheel)||state.modal!=='time')return;
  const old=wheelControllers.get(wheel);old?.cancel();
  const start=wheel.scrollTop,startTime=performance.now(),duration=reducedMotion()?0:220;let raf,stopped=false;
  const controller={cancel(){stopped=true;cancelAnimationFrame(raf);activeWheelControllers.delete(controller);delete wheel.dataset.uiMoving;}};activeWheelControllers.add(controller);wheelControllers.set(wheel,controller);wheel.dataset.uiMoving='1';
  const tick=now=>{if(stopped||!wheel.isConnected)return;const t=duration?Math.min(1,(now-startTime)/duration):1;
    // Cubic ease-out keeps touch settling and taps under the same 220 ms controller.
    wheel.scrollTop=start+(top-start)*sourceCurve(t);updateWheel(wheel);
    if(t<1)raf=requestAnimationFrame(tick);else{delete wheel.dataset.uiMoving;activeWheelControllers.delete(controller);wheelControllers.delete(wheel);delete wheel.dataset.uiPending;updateWheel(wheel);onDone();}
  };raf=requestAnimationFrame(tick);
}
function setWheel(key,value){
  draft[key]=value;const wheel=$(`[data-wheel="${key}"]`,overlay);if(!wheel)return;
  clearTimeout(wheelTimers[key]);const count=wheelCount(key),index=key==='minute'?value/5:value,current=Math.round(wheel.scrollTop/32);
  const target=key==='date'?index+1:Array.from({length:5},(_,cycle)=>index+cycle*count).sort((a,b)=>Math.abs(a-current)-Math.abs(b-current))[0];
  wheel.dataset.uiPending=String(value);moveWheel(wheel,target*32);
}
function updateWheel(wheel){
  if(!overlay.contains(wheel)||state.modal!=='time')return;
  const index=Math.round(wheel.scrollTop/32),key=wheel.dataset.wheel,count=wheelCount(key),value=key==='date'?Math.max(0,Math.min(7,index-1)):((index%count)+count)%count;
  draft[key]=wheel.dataset.uiPending!==undefined?Number(wheel.dataset.uiPending):key==='minute'?value*5:value;
  wheel.querySelectorAll('.wheel-tick').forEach((tick,i)=>{
    const signed=i-wheel.scrollTop/32,distance=Math.abs(signed),d=Math.min(4,distance),low=Math.floor(d),fraction=d-low,sizes=[22.17,18.37,14.57,11.4,5.07],positions=[0,30.5,55.5,75,84];
    tick.style.fontSize=`${sizes[low]+((sizes[low+1]??sizes[low])-sizes[low])*fraction}px`;
    const projected=positions[low]+((positions[low+1]??positions[low])-positions[low])*fraction;
    tick.style.transform=distance<=4?`translateY(${Math.sign(signed)*(projected-distance*32)}px)`:'none';
    tick.style.opacity=distance>4?'0':distance<.5?'1':'.35';tick.setAttribute('aria-selected',String(i===index));
  });
}
function bindWheels(){
  const picker=$('.time-picker',overlay);picker?.style.setProperty('--wheel-padding',`${(picker.clientHeight-32)/2}px`);
  overlay.querySelectorAll('[data-wheel]').forEach(wheel=>{
    const key=wheel.dataset.wheel,count=wheelCount(key);wheel.scrollTop=((key==='date'?1:2*count)+(key==='minute'?draft[key]/5:draft[key]))*32;updateWheel(wheel);
    let frame;
    const interrupt=()=>{wheelControllers.get(wheel)?.cancel();wheelControllers.delete(wheel);delete wheel.dataset.uiPending;delete wheel.dataset.uiMoving;clearTimeout(wheelTimers[key]);};
    wheel.addEventListener('pointerdown',interrupt,{passive:true});wheel.addEventListener('wheel',interrupt,{passive:true});
    wheel.addEventListener('scroll',()=>{
      if(!overlay.contains(wheel)||state.modal!=='time')return;
      cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>updateWheel(wheel));
      if(wheel.dataset.uiMoving)return;clearTimeout(wheelTimers[key]);
      wheelTimers[key]=setTimeout(()=>{
        let index=Math.round(wheel.scrollTop/32);if(key==='date')index=Math.max(1,Math.min(8,index));
        moveWheel(wheel,index*32,()=>{if(key!=='date'&&(index<count||index>3*count)){wheel.scrollTop+=(index<count?2:-2)*count*32;updateWheel(wheel);}});
      },160);
    },{passive:true});
    wheel.addEventListener('keydown',e=>{
      if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
      const max=count-1,current=key==='minute'?draft[key]/5:draft[key],next=key==='date'?Math.max(0,Math.min(max,current+(e.key==='ArrowDown'?1:-1))):(current+(e.key==='ArrowDown'?1:-1)+max+1)%(max+1);setWheel(key,key==='minute'?next*5:next);
    });
  });
}
function animateDetails(pose){
  const food=$('.order-food',overlay),fields=$('.order-fields',overlay),scroller=orderScroller(),expanded=$('.order-body',overlay).classList.contains('details-expanded');
  const duration=state.order.status==='transit'?300:350;
  scrollControllers.get(scroller)?.cancel();
  animateFinite(food,[{height:`${pose.food}px`},{height:expanded?'0px':`${food.scrollHeight}px`}],{duration});
  [...food.children].forEach((row,index)=>animateFinite(row,[{transform:pose.rows[index]||'translateY(0)'},{transform:expanded?`translateY(${getComputedStyle(row).getPropertyValue('--row-end')})`:'translateY(0)'}],{duration}));
  animateFinite(fields,[{height:`${pose.fields}px`,paddingTop:pose.paddingTop,paddingBottom:pose.paddingBottom,opacity:expanded?0:1},{height:expanded?`${fields.scrollHeight}px`:'0px',paddingTop:expanded?'16px':'0px',paddingBottom:expanded?(state.order.status==='transit'?'32px':'20px'):'0px',opacity:expanded?1:0}],{duration});
  const scrollTarget=scroller.classList.contains('order-content')?Math.min($('.order-body',overlay).getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop,Math.max(0,scroller.scrollHeight-scroller.clientHeight)):0;
  if(expanded&&(pose.scroll||scrollTarget)){scroller.scrollTop=pose.scroll;const start=performance.now();let frame,stopped=false;const controller={cancel(){stopped=true;cancelAnimationFrame(frame);}};scrollControllers.set(scroller,controller);const move=now=>{if(stopped||!overlay.contains(scroller))return;const t=Math.min(1,(now-start)/duration);scroller.scrollTop=pose.scroll+(scrollTarget-pose.scroll)*sourceCurve(t);if(t<1)frame=requestAnimationFrame(move);else scrollControllers.delete(scroller);};frame=requestAnimationFrame(move);
    if(!scroller.dataset.uiScrollBound){scroller.dataset.uiScrollBound='1';for(const event of ['pointerdown','wheel','touchstart'])scroller.addEventListener(event,()=>scrollControllers.get(scroller)?.cancel(),{passive:true});}
  }
}
function toggleDetails(){if(!state.order)return;state.order.details=!state.order.details;render({onlyOverlay:true});scheduleStatus();}
async function changeStory(direction){
  if(state.modal!=='story'||closing)return;
  if(storyBusy){storyQueue.push(direction);return;}storyBusy=true;const generation=storyGeneration;
  const creative=$('.story-creative',overlay),old=creative.cloneNode();old.classList.add('story-outgoing');
  state.promoIndex=(state.promoIndex+direction+DATA.promos.length)%DATA.promos.length;history.replaceState(view(),'');render({onlyOverlay:true});
  const layer=$('.story-view',overlay);layer.append(old);
  await Promise.all([animateFinite(old,[{opacity:1},{opacity:0}],{duration:180,easing:'ease-out'},()=>old.remove()),animateFinite($('.story-creative:not(.story-outgoing)',layer),[{opacity:0},{opacity:1}],{duration:180,easing:'ease-out'})]);
  if(storyGeneration!==generation)return;storyBusy=false;if(storyQueue.length)changeStory(storyQueue.shift());
}
phone.addEventListener('input',e=>{if(e.target.id!=='search')return;state.query=e.target.value;patch($('.product-grid',screen),grid());});
phone.addEventListener('keydown',e=>{if(e.target.id==='search'&&e.key==='Enter')e.target.blur();});
phone.addEventListener('click',e=>{
  const target=e.target.closest('[data-action]');if(!target||target.disabled||target.dataset.uiSuppress||target.closest('#motion-host'))return;
  const action=target.dataset.action;
  if(action==='quantity'){
    state.cart=changeQuantity(state.cart,target.dataset.id,Number(target.dataset.delta));render();
    $('#announcement').textContent=`${DATA.products[target.dataset.id].title}: ${state.cart[target.dataset.id]||0}. В корзине ${money(totals(state.cart,state.mode).food)}`;
  }else if(action==='mode'){if(state.mode===target.dataset.mode)openModal('time');else {state.mode=target.dataset.mode;render();}}
  else if(action==='brand'||action==='catalog')navigate('catalog');
  else if(action==='home')navigate('home');else if(action==='cart')navigate('cart');
  else if(action==='time')openModal('time');
  else if(action==='time-apply'){for(const wheel of overlay.querySelectorAll('[data-wheel]')){if(wheel.dataset.uiPending===undefined)updateWheel(wheel);}state.time={...draft};closeModal();}
  else if(action==='wheel-value')setWheel(target.dataset.key,Number(target.dataset.value));
  else if(action==='modal-close')closeModal({easing:state.modal==='promo'&&target.dataset.drag?'ease-out':ease});
  else if(action==='promotion-height')setPromotionPosition(state.promos==='expanded'?'standard':state.promos==='minimum'?'standard':'expanded');
  else if(action==='promotion-standard')setPromotionPosition('standard');
  else if(action==='promo'||action==='story')openModal(action,Number(target.dataset.index));
  else if(action==='story-prev'||action==='story-next')changeStory(action==='story-next'?1:-1);
  else if(action==='search-open'){route({search:true});$('#search',screen).focus({preventScroll:true});}
  else if(action==='search-close')history.back();
  else if(action==='search-clear'){state.query='';render();$('#search',screen).focus({preventScroll:true});}
  else if(action==='suggestion'){state.query=target.dataset.query==='Роллы с лососем'?'Ролл':target.dataset.query;render();$('#search',screen).focus({preventScroll:true});}
  else if(action==='category'){state.category=target.dataset.category;state.query='';scrollPositions.set('catalogue',[0,0]);render();$('.product-grid',screen).scrollTop=0;}
  else if(action==='favourite'){const id=target.dataset.id;favourites.has(id)?favourites.delete(id):favourites.add(id);render();}
  else if(action==='clear-cart'){state.cart={};render();}
  else if(action==='total-expand'){state.totalExpanded=!state.totalExpanded;render();}
  else if(action==='pay'){
    if(!totals(state.cart,state.mode).quantity)return;state.order=snapshot(state.cart,state.mode,state.time,orderNumber++);state.cart={};state.promos='standard';
    route({screen:'home',search:false,modal:null},true);openModal('order');
  }else if(action==='order')openModal('order');
  else if(action==='order-details')toggleDetails();
  else if(action==='cancel-open')openModal('cancel');
  else if(action==='cancel-close')closeModal();
  else if(action==='cancel-confirm'){if(state.order&&!['cancelled','delivered'].includes(state.order.status))closeModal({confirm:true});}
  else if(action==='repeat'){
    if(!state.order||closing)return;closing=true;const layer=overlay.firstElementChild;
    state.cart={...state.order.cart};state.mode=state.order.mode;state.time=state.order.time?{...state.order.time}:null;state.order=null;clearTimeout(statusTimer);
    leaveLayer(layer,'order').then(()=>{closedLayers.add(layer);closing=false;route({screen:'home',modal:null,search:false},true);});
  }
});
phone.addEventListener('pointerdown',e=>{
  const handle=e.target.closest('[data-drag]');if(!handle||closing||swipe||e.isPrimary===false||e.button!==0)return;
  const panel=handle.dataset.drag==='promos'?$('.promotion-panel',screen):handle.closest('.modal-sheet');const baseY=new DOMMatrixReadOnly(getComputedStyle(panel).transform).m42;freezeMotion(panel);
  swipe={handle,pointerId:e.pointerId,startY:e.clientY,lastY:e.clientY,type:handle.dataset.drag,baseY};handle.setPointerCapture(e.pointerId);
});
phone.addEventListener('pointermove',e=>{
  if(!swipe||e.pointerId!==swipe.pointerId)return;swipe.lastY=e.clientY;const dy=e.clientY-swipe.startY;
  const panel=swipe.type==='promos'?$('.promotion-panel',screen):swipe.handle.closest('.modal-sheet');
  if(panel){panel.style.transition='none';panel.style.transform=`translateY(${swipe.baseY+(dy>0?dy*.75:swipe.type==='promos'?dy*.4:dy*.15)}px)`;}
});
function finishDrag(cancelled=false){
  if(!swipe)return;const s=swipe,dy=s.lastY-s.startY;swipe=null;
  const panel=s.type==='promos'?$('.promotion-panel',screen):s.handle.closest('.modal-sheet');
  if(!panel)return;panel.style.transition='';
  // A short drag returns to its position; its synthetic click must not toggle or close it.
  if(cancelled||Math.abs(dy)>6){s.handle.dataset.uiSuppress='1';setTimeout(()=>delete s.handle.dataset.uiSuppress,400);}
  if(!cancelled&&Math.abs(dy)>28){
    if(s.type==='promos')setPromotionPosition(state.screen==='home'?(state.promos==='expanded'?'standard':'expanded'):dy<0?state.promos==='minimum'?'standard':'expanded':state.promos==='expanded'?'standard':'minimum');
    else if(dy>0)closeModal({easing:state.modal==='promo'?'ease-out':ease});else returnPanel(panel);
  }else returnPanel(panel);
}
function returnPanel(panel){const transform=getComputedStyle(panel).transform,firstHeight=panel.getBoundingClientRect().height;panel.style.transform='';panel.style.height='';const height=panel.offsetHeight;animateFinite(panel,[{transform,height:`${firstHeight}px`},{transform:'translateY(0)',height:`${height}px`}],{duration:280});}
phone.addEventListener('pointerup',e=>{if(e.pointerId===swipe?.pointerId)finishDrag();});
phone.addEventListener('pointercancel',e=>{if(e.pointerId===swipe?.pointerId)finishDrag(true);});
phone.addEventListener('lostpointercapture',e=>{if(e.pointerId===swipe?.pointerId)finishDrag(true);});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(state.modal)closeModal({easing:state.modal==='promo'?'ease-out':ease});else if(state.search)history.back();else if(state.promos==='expanded')setPromotionPosition('standard');}
  if(e.key==='Tab'&&state.modal&&!closing){
    const layer=state.modal==='cancel'?$('.cancel-layer',overlay):overlay.firstElementChild;
    const buttons=[...layer.querySelectorAll('button,input,[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.disabled&&!el.closest('[inert]')&&getComputedStyle(el).visibility!=='hidden'),first=buttons[0],last=buttons.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }
});
let viewportFrame;
function viewport(){cancelAnimationFrame(viewportFrame);viewportFrame=requestAnimationFrame(()=>{const vv=window.visualViewport;document.documentElement.style.setProperty('--viewport-height',`${vv?.height??innerHeight}px`);document.documentElement.style.setProperty('--viewport-top',`${vv?.offsetTop??0}px`);});}
window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);
const pickerObserver=new ResizeObserver(entries=>{for(const entry of entries)if(entry.target.classList.contains('time-picker'))entry.target.style.setProperty('--wheel-padding',`${(entry.target.clientHeight-32)/2}px`);});
viewport();render();
