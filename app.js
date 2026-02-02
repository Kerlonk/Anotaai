// ==================== CONFIGURAÇÃO DO SUPABASE ====================
const SUPABASE_URL = 'https://dfkrebxvbxobnzhzdgxl.supabase.co';  
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma3JlYnh2YnhvYm56aHpkZ3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NjA3MzEsImV4cCI6MjA4NDEzNjczMX0.ZpTkRzcCNhqAQFqSdzwVKrP6LtoWSYsbmmaqqoz0e1k';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== ESTADO GLOBAL ====================
let currentUser = null;
let currentList = null;
let lists = [];
let allUsers = [];

// ==================== FUNÇÕES UTILITÁRIAS ====================
function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
}

function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
}

function showNotification(message, isError = false) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = 'notification ' + (isError ? 'error' : '');
    notification.style.display = 'block';
    setTimeout(() => notification.style.display = 'none', 3000);
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebar-overlay').classList.remove('active');
}

// ==================== AUTENTICAÇÃO ====================
async function checkAuth() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        if (!session) {
            window.location.href = 'index.html';
            return;
        }
        
        currentUser = {
            id: session.user.id,
            email: session.user.email
        };
        
        console.log('✅ Usuário autenticado:', currentUser.id);
        
        // Carregar perfil
        await loadUserProfile();
        
        // Carregar listas
        await loadAllLists();
        
        // Carregar usuários para busca
        await loadAllUsers();
        
        // Atualizar UI
        updateProfileDisplay();
        
    } catch (error) {
        console.error('❌ Erro de autenticação:', error);
        window.location.href = 'index.html';
    }
}

async function loadUserProfile() {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        
        if (error && error.code !== 'PGRST116') throw error;
        
        if (data) {
            currentUser.name = data.name || currentUser.email.split('@')[0];
            currentUser.username = data.username || '@' + currentUser.email.split('@')[0];
        } else {
            // Criar perfil se não existir
            await createUserProfile();
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar perfil:', error);
        currentUser.name = currentUser.email.split('@')[0];
        currentUser.username = '@' + currentUser.email.split('@')[0];
    }
}

async function createUserProfile() {
    try {
        const newProfile = {
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.email.split('@')[0],
            username: '@' + currentUser.email.split('@')[0],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        const { error } = await supabase
            .from('profiles')
            .insert([newProfile]);
        
        if (error) throw error;
        
        currentUser.name = newProfile.name;
        currentUser.username = newProfile.username;
        
        console.log('✅ Perfil criado');
    } catch (error) {
        console.error('❌ Erro ao criar perfil:', error);
    }
}

function updateProfileDisplay() {
    const profileBtn = document.getElementById('profile-btn');
    const profileAvatar = document.getElementById('profile-avatar-large');
    
    const initial = currentUser.name ? currentUser.name[0].toUpperCase() : 'U';
    
    if (profileBtn) profileBtn.textContent = initial;
    if (profileAvatar) profileAvatar.textContent = initial;
}

async function logout() {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
}

// ==================== CARREGAR TODOS OS USUÁRIOS ====================
async function loadAllUsers() {
    try {
        console.log('👥 Carregando usuários...');
        
        const { data, error } = await supabase
            .from('profiles')
            .select('id, name, username, email')
            .order('name');
        
        if (error) throw error;
        
        allUsers = (data || []).filter(u => u.id !== currentUser.id);
        console.log(`✅ ${allUsers.length} usuários carregados`);
        
    } catch (error) {
        console.error('❌ Erro ao carregar usuários:', error);
        allUsers = [];
    }
}

// ==================== LISTAS ====================
async function loadAllLists() {
    try {
        console.log('📋 Carregando listas...');
        
        // Buscar listas onde o usuário é dono OU membro
        const { data: ownedLists, error: ownedError } = await supabase
            .from('shopping_lists')
            .select('*')
            .eq('owner_id', currentUser.id);
        
        if (ownedError) throw ownedError;
        
        // Buscar listas compartilhadas (usando list_members se existir)
        const { data: sharedLists, error: sharedError } = await supabase
            .from('shopping_lists')
            .select('*, shared_with')
            .contains('shared_with', [currentUser.id]);
        
        // Combinar listas
        const allListsData = [...(ownedLists || [])];
        
        if (sharedLists && !sharedError) {
            sharedLists.forEach(list => {
                if (!allListsData.find(l => l.id === list.id)) {
                    allListsData.push(list);
                }
            });
        }
        
        lists = allListsData.sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        );
        
        console.log(`✅ ${lists.length} listas carregadas`);
        renderLists();
        
    } catch (error) {
        console.error('❌ Erro ao carregar listas:', error);
        lists = [];
        renderLists();
    }
}

function renderLists() {
    const container = document.getElementById('lists-container');
    
    if (!lists || lists.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: rgba(255,255,255,0.7);">
                <i class="fas fa-clipboard-list fa-3x"></i>
                <p>Nenhuma lista</p>
                <p style="font-size: 12px;">Clique em "Nova Lista"</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = lists.map(list => {
        const isOwner = list.owner_id === currentUser.id;
        const isShared = list.shared_with && list.shared_with.length > 0;
        const itemCount = Array.isArray(list.items) ? list.items.length : 0;
        
        return `
            <div class="list-item ${currentList?.id === list.id ? 'active' : ''}" 
                 onclick="selectList('${list.id}')">
                <h3>${list.name}</h3>
                <p>${list.description || 'Sem descrição'}</p>
                <p style="font-size: 11px; opacity: 0.6;">
                    ${itemCount} itens • ${isOwner ? 'Minha lista' : 'Compartilhada'}
                </p>
                ${isShared ? '<span class="shared-badge"><i class="fas fa-users"></i> Compartilhada</span>' : ''}
            </div>
        `;
    }).join('');
}

async function selectList(listId) {
    try {
        const list = lists.find(l => l.id === listId);
        if (!list) {
            showNotification('Lista não encontrada', true);
            return;
        }
        
        currentList = list;
        document.getElementById('current-list-title').textContent = list.name;
        
        // Mostrar botões de ação apenas para o dono
        const isOwner = list.owner_id === currentUser.id;
        const actionsDiv = document.getElementById('list-actions');
        actionsDiv.style.display = isOwner ? 'flex' : 'none';
        
        renderItems();
        renderLists();
        closeSidebar();
        
    } catch (error) {
        console.error('❌ Erro ao selecionar lista:', error);
        showNotification('Erro ao carregar lista', true);
    }
}

async function saveList(list, isNew = false) {
    try {
        if (isNew) {
            const newListData = {
                name: list.name,
                description: list.description || '',
                items: list.items || [],
                owner_id: currentUser.id,
                shared_with: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            const { data, error } = await supabase
                .from('shopping_lists')
                .insert([newListData])
                .select()
                .single();
            
            if (error) throw error;
            return data;
            
        } else {
            const { data, error } = await supabase
                .from('shopping_lists')
                .update({
                    name: list.name,
                    description: list.description,
                    items: list.items,
                    shared_with: list.shared_with,
                    updated_at: new Date().toISOString()
                })
                .eq('id', list.id)
                .select()
                .single();
            
            if (error) throw error;
            return data;
        }
    } catch (error) {
        console.error('❌ Erro ao salvar lista:', error);
        throw error;
    }
}

// ==================== ITENS ====================
function renderItems() {
    if (!currentList) return;
    
    const items = currentList.items || [];
    const totalValue = items
        .filter(i => i.completed && i.price)
        .reduce((sum, i) => sum + parseFloat(i.price || 0), 0);
    
    const isOwner = currentList.owner_id === currentUser.id;
    const content = document.getElementById('list-content');
    
    content.innerHTML = `
        ${isOwner ? `
        <div class="add-item-grid">
            <div class="input-wrapper">
                <label>Nome do Item</label>
                <input type="text" id="new-item-name" placeholder="Ex: Arroz">
            </div>
            <div class="input-wrapper">
                <label>Quantidade</label>
                <input type="number" id="new-item-quantity" placeholder="1" step="0.1" min="0" value="1">
            </div>
            <div class="input-wrapper">
                <label>Unidade</label>
                <select id="new-item-unit">
                    <option value="und">und</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                </select>
            </div>
            <button onclick="addItem()" class="btn btn-success" style="height: 46px;">
                <i class="fas fa-plus"></i> Adicionar
            </button>
        </div>
        ` : ''}
        
        <div class="stats-bar">
            <div class="stat-item">
                <div class="stat-label">Total</div>
                <div class="stat-value">${items.length}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Comprados</div>
                <div class="stat-value">${items.filter(i => i.completed).length}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Pendentes</div>
                <div class="stat-value">${items.filter(i => !i.completed).length}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Valor Total</div>
                <div class="stat-value money">R$ ${totalValue.toFixed(2)}</div>
            </div>
        </div>
        
        ${currentList.shared_with && currentList.shared_with.length > 0 ? `
        <div class="shared-users">
            <strong><i class="fas fa-users"></i> Compartilhado com:</strong>
            ${currentList.shared_with.map(userId => {
                const user = allUsers.find(u => u.id === userId);
                return user ? `
                    <div class="shared-user-item">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 35px; height: 35px; border-radius: 50%; background: linear-gradient(135deg, #4cc9f0 0%, #4361ee 100%); color: white; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold;">
                                ${user.name[0]}
                            </div>
                            <div>
                                <strong>${user.name}</strong>
                                <div style="font-size: 12px; color: #666;">${user.username}</div>
                            </div>
                        </div>
                        ${isOwner ? `<button class="btn btn-small btn-danger" onclick="removeUserFromList('${user.id}')">Remover</button>` : ''}
                    </div>
                ` : '';
            }).join('')}
        </div>
        ` : ''}
        
        <div>
            ${items.length === 0 ? `
                <div style="text-align: center; padding: 40px 20px; color: #999;">
                    <i class="fas fa-shopping-basket fa-2x"></i>
                    <p>Nenhum item na lista</p>
                </div>
            ` : items.map((item, index) => `
                <div class="item">
                    <div class="item-checkbox">
                        <input type="checkbox" ${item.completed ? 'checked' : ''} 
                               onchange="toggleItem(${index})" ${!isOwner ? 'disabled' : ''}>
                    </div>
                    <div class="item-content">
                        <div class="item-header">
                            <span class="item-text ${item.completed ? 'completed' : ''}">
                                ${item.text}
                            </span>
                            <span class="item-quantity ${item.completed ? 'completed' : ''}">
                                ${item.quantity} ${item.unit}
                            </span>
                        </div>
                        ${item.completed ? `
                            <div style="margin-top: 8px;">
                                ${item.price ? 
                                    `<span class="item-price-display">R$ ${parseFloat(item.price).toFixed(2)}</span>` : 
                                    isOwner ? `<input type="number" class="item-price-input" placeholder="R$ 0,00" step="0.01" min="0" onchange="setItemPrice(${index}, this.value)">` : 
                                    '<span style="color: #999; font-size: 14px;">Sem valor</span>'
                                }
                            </div>
                        ` : ''}
                    </div>
                    ${isOwner ? `
                    <div>
                        <button class="item-btn" onclick="deleteItem(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `;
    
    // Enter para adicionar
    const nameInput = document.getElementById('new-item-name');
    if (nameInput) {
        nameInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') addItem();
        });
    }
}

async function addItem() {
    const nameInput = document.getElementById('new-item-name');
    const quantityInput = document.getElementById('new-item-quantity');
    const unitSelect = document.getElementById('new-item-unit');
    
    const text = nameInput?.value.trim();
    const quantity = parseFloat(quantityInput?.value) || 1;
    const unit = unitSelect?.value || 'und';
    
    if (!text) {
        showNotification('Digite o nome do item', true);
        return;
    }
    
    if (quantity <= 0) {
        showNotification('Quantidade inválida', true);
        return;
    }
    
    try {
        if (!currentList.items) currentList.items = [];
        
        currentList.items.push({
            id: Date.now().toString(),
            text,
            quantity,
            unit,
            completed: false,
            price: null,
            created_at: new Date().toISOString()
        });
        
        await saveList(currentList);
        
        const index = lists.findIndex(l => l.id === currentList.id);
        if (index !== -1) lists[index] = currentList;
        
        nameInput.value = '';
        quantityInput.value = '1';
        unitSelect.value = 'und';
        
        renderItems();
        renderLists();
        showNotification('Item adicionado!');
        
    } catch (error) {
        console.error('❌ Erro ao adicionar item:', error);
        showNotification('Erro ao adicionar item', true);
    }
}

async function toggleItem(index) {
    if (!currentList?.items) return;
    
    try {
        currentList.items[index].completed = !currentList.items[index].completed;
        if (!currentList.items[index].completed) {
            currentList.items[index].price = null;
        }
        
        await saveList(currentList);
        
        const listIndex = lists.findIndex(l => l.id === currentList.id);
        if (listIndex !== -1) lists[listIndex] = currentList;
        
        renderItems();
        
    } catch (error) {
        console.error('❌ Erro ao atualizar item:', error);
        showNotification('Erro ao atualizar item', true);
    }
}

async function setItemPrice(index, price) {
    if (!currentList?.items) return;
    
    try {
        const priceValue = parseFloat(price);
        if (priceValue > 0) {
            currentList.items[index].price = priceValue;
            await saveList(currentList);
            
            const listIndex = lists.findIndex(l => l.id === currentList.id);
            if (listIndex !== -1) lists[listIndex] = currentList;
            
            renderItems();
            showNotification('Valor adicionado!');
        }
    } catch (error) {
        console.error('❌ Erro ao definir preço:', error);
        showNotification('Erro ao definir preço', true);
    }
}

async function deleteItem(index) {
    if (!confirm('Excluir este item?')) return;
    
    try {
        currentList.items.splice(index, 1);
        await saveList(currentList);
        
        const listIndex = lists.findIndex(l => l.id === currentList.id);
        if (listIndex !== -1) lists[listIndex] = currentList;
        
        renderItems();
        renderLists();
        showNotification('Item removido');
        
    } catch (error) {
        console.error('❌ Erro ao excluir item:', error);
        showNotification('Erro ao excluir item', true);
    }
}

// ==================== COMPARTILHAMENTO ====================
async function shareListWithUser(userId) {
    if (!currentList) return;
    
    try {
        if (!currentList.shared_with) currentList.shared_with = [];
        
        if (currentList.shared_with.includes(userId)) {
            showNotification('Usuário já tem acesso', true);
            return;
        }
        
        currentList.shared_with.push(userId);
        await saveList(currentList);
        
        const user = allUsers.find(u => u.id === userId);
        showNotification(`Lista compartilhada com ${user?.name || 'usuário'}!`);
        
        renderSharedUsers();
        document.getElementById('user-search').value = '';
        document.getElementById('search-results').innerHTML = '';
        renderItems();
        renderLists();
        
    } catch (error) {
        console.error('❌ Erro ao compartilhar:', error);
        showNotification('Erro ao compartilhar lista', true);
    }
}

async function removeUserFromList(userId) {
    if (!confirm('Remover este usuário?')) return;
    
    try {
        currentList.shared_with = currentList.shared_with.filter(id => id !== userId);
        await saveList(currentList);
        
        renderSharedUsers();
        renderItems();
        renderLists();
        showNotification('Usuário removido');
        
    } catch (error) {
        console.error('❌ Erro ao remover usuário:', error);
        showNotification('Erro ao remover usuário', true);
    }
}

function renderSharedUsers() {
    const container = document.getElementById('shared-users-list');
    const section = document.getElementById('shared-users-section');
    
    if (!currentList?.shared_with || currentList.shared_with.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    
    const sharedUsers = currentList.shared_with
        .map(userId => allUsers.find(u => u.id === userId))
        .filter(u => u);
    
    container.innerHTML = sharedUsers.map(user => `
        <div class="shared-user-item">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div class="user-avatar">${user.name[0]}</div>
                <div>
                    <strong>${user.name}</strong>
                    <div style="font-size: 12px; color: #666;">${user.username}</div>
                </div>
            </div>
            <button class="btn btn-small btn-danger" onclick="removeUserFromList('${user.id}')">
                Remover
            </button>
        </div>
    `).join('');
}

// ==================== EVENT LISTENERS ====================
document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('sidebar-overlay').classList.add('active');
});

document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

document.getElementById('logout-btn').addEventListener('click', logout);

document.getElementById('new-list-btn').addEventListener('click', () => {
    openModal('create-list-modal');
});

document.getElementById('create-list-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('list-name').value.trim();
    const description = document.getElementById('list-description').value.trim();
    
    if (!name) {
        showNotification('Digite um nome', true);
        return;
    }
    
    try {
        const newList = { name, description, items: [] };
        const savedList = await saveList(newList, true);
        
        lists.unshift(savedList);
        currentList = savedList;
        
        closeModal('create-list-modal');
        document.getElementById('create-list-form').reset();
        
        renderLists();
        selectList(savedList.id);
        showNotification('Lista criada!');
        
    } catch (error) {
        console.error('❌ Erro ao criar lista:', error);
        showNotification('Erro ao criar lista', true);
    }
});

document.getElementById('delete-list-btn').addEventListener('click', async () => {
    if (!confirm(`Excluir "${currentList.name}"?`)) return;
    
    try {
        await supabase
            .from('shopping_lists')
            .delete()
            .eq('id', currentList.id);
        
        lists = lists.filter(l => l.id !== currentList.id);
        currentList = null;
        
        document.getElementById('list-actions').style.display = 'none';
        document.getElementById('list-content').innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #999;">
                <i class="fas fa-shopping-basket fa-3x"></i>
                <h3>Nenhuma lista selecionada</h3>
            </div>
        `;
        
        renderLists();
        showNotification('Lista excluída');
        
    } catch (error) {
        console.error('❌ Erro ao excluir:', error);
        showNotification('Erro ao excluir lista', true);
    }
});

document.getElementById('profile-btn').addEventListener('click', () => {
    document.getElementById('profile-email').textContent = currentUser.email;
    document.getElementById('profile-name').value = currentUser.name || '';
    document.getElementById('profile-username').value = currentUser.username || '';
    openModal('profile-modal');
});

document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('profile-name').value.trim();
    const username = document.getElementById('profile-username').value.trim();
    
    if (!name || !username) {
        showNotification('Preencha todos os campos', true);
        return;
    }
    
    try {
        await supabase
            .from('profiles')
            .upsert({
                id: currentUser.id,
                name,
                username,
                email: currentUser.email,
                updated_at: new Date().toISOString()
            });
        
        currentUser.name = name;
        currentUser.username = username;
        
        await loadAllUsers();
        updateProfileDisplay();
        closeModal('profile-modal');
        showNotification('Perfil atualizado!');
        
    } catch (error) {
        console.error('❌ Erro ao salvar perfil:', error);
        showNotification('Erro ao salvar perfil', true);
    }
});

document.getElementById('share-list-btn').addEventListener('click', async () => {
    await loadAllUsers();
    renderSharedUsers();
    document.getElementById('user-search').value = '';
    document.getElementById('search-results').innerHTML = '';
    openModal('share-modal');
});

document.getElementById('user-search').addEventListener('input', async (e) => {
    const query = e.target.value.toLowerCase().trim();
    const results = document.getElementById('search-results');
    
    if (!query) {
        results.innerHTML = '';
        return;
    }
    
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, name, username, email')
            .or(`name.ilike.%${query}%,username.ilike.%${query}%,email.ilike.%${query}%`)
            .neq('id', currentUser.id)
            .limit(10);
        
        if (error) throw error;
        
        const available = (data || []).filter(u => 
            !currentList.shared_with?.includes(u.id)
        );
        
        if (available.length === 0) {
            results.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Nenhum usuário encontrado</p>';
        } else {
            results.innerHTML = available.map(u => `
                <div class="user-result">
                    <div class="user-info">
                        <div class="user-avatar">${u.name[0]}</div>
                        <div>
                            <h4>${u.name}</h4>
                            <p style="font-size: 13px; color: #666;">${u.username} • ${u.email}</p>
                        </div>
                    </div>
                    <button class="btn btn-small btn-success" onclick="shareListWithUser('${u.id}')">
                        <i class="fas fa-plus"></i> Adicionar
                    </button>
                </div>
            `).join('');
        }
        
    } catch (error) {
        console.error('❌ Erro na busca:', error);
        results.innerHTML = '<p style="text-align: center; color: #f72585; padding: 20px;">Erro na busca</p>';
    }
});

// Fechar modais
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
});

// ==================== INICIALIZAÇÃO ====================
checkAuth();