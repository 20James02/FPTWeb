/**
 * PAGEFPT VERTICAL PLAN COMPARISON CONTROLLER
 * Optimized for mobile screens with stacked card format
 */

let compareItems = [];

function toggleCompare(id, name, speed, fee, modem) {
  const existingIdx = compareItems.findIndex(p => p.id === id);

  if (existingIdx !== -1) {
    compareItems.splice(existingIdx, 1);
    showToast(`Đã bỏ ${name} khỏi danh sách so sánh.`, 'info');
  } else {
    if (compareItems.length >= 3) {
      showToast('Bạn chỉ có thể so sánh tối đa 3 gói cước cùng lúc.', 'error');
      openCompareModal();
      return;
    }
    compareItems.push({ id, name, speed, fee, modem });
    showToast(`Đã thêm ${name} vào so sánh (${compareItems.length}/3).`, 'success');
  }

  renderCompareCards();

  if (compareItems.length > 0) {
    openCompareModal();
  }
}

function openCompareModal() {
  renderCompareCards();
  const backdrop = document.getElementById('compare-backdrop');
  if (backdrop) {
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeCompareModal() {
  const backdrop = document.getElementById('compare-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function handleCompareBackdropClick(e) {
  if (e.target.id === 'compare-backdrop') {
    closeCompareModal();
  }
}

function renderCompareCards() {
  const container = document.getElementById('compare-cards-container');
  if (!container) return;

  if (compareItems.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: var(--space-6); color: var(--text-muted);">
        Chưa có gói cước nào được chọn. Hãy bấm nút "+ So sánh gói này" trên danh sách gói!
      </div>
    `;
    return;
  }

  container.replaceChildren();
  for (const item of compareItems) {
    const card=document.createElement('div');
    card.style.cssText='background:var(--bg-surface-muted);border:1.5px solid var(--border-subtle);border-radius:var(--radius-md);padding:var(--space-4)';
    const name=document.createElement('h3'); name.textContent=item.name;
    const fee=document.createElement('p'); fee.textContent=item.fee;
    const speed=document.createElement('p'); speed.textContent='Băng thông: '+item.speed;
    const equipment=document.createElement('p'); equipment.textContent='Thiết bị: '+item.modem;
    const select=document.createElement('button'); select.type='button'; select.className='btn-select-plan primary'; select.textContent='Nhận Tư Vấn Gói Này';
    select.onclick=()=>{closeCompareModal();openBottomSheet(item.name,'',item.id);};
    const remove=document.createElement('button'); remove.type='button'; remove.textContent='Bỏ Khỏi So Sánh'; remove.onclick=()=>removeCompareItem(item.id);
    card.append(name,fee,speed,equipment,select,remove); container.appendChild(card);
  }

}

function removeCompareItem(id) {
  compareItems = compareItems.filter(p => p.id !== id);
  renderCompareCards();
  if (compareItems.length === 0) {
    closeCompareModal();
  }
}
