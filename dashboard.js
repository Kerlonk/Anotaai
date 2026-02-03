// ==================== ANOTA AÍ - JAVASCRIPT ====================
// Versão: 6.0 - PWA + Realtime

// ==================== ESTADO GLOBAL ====================
let currentUser = null;
let currentList = null;
let lists = [];
let allUsers = [];
let realtimeChannel = null;

// ==================== PWA ====================
// Registrar Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('✅ PWA: Service Worker registrado');
                
                // Verificar atualizações
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showNotification('Nova versão disponível! Recarregue a página.');
                        }
                    });
                });
            })
            .catch(error => {
                console.log('❌ PWA: Erro ao registrar Service Worker:', error);
            });
    });
}

// Prompt de instalação PWA
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Mostrar banner de instalação customizado (opcional)
    setTimeout(() => {
        if (confirm('Instalar Anota Aí no seu dispositivo?')) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('✅ PWA: Usuário aceitou instalação');
                }
                deferredPrompt = null;
            });
        }
    }, 3000);
});

// ==================== MODO ESCURO ====================
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    showNotification(`Modo ${newTheme === 'dark' ? 'Escuro' : 'Claro'} ativado`);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#theme-toggle i');
    if (icon) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

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
    notification.className = 'notification ' + (isError ? 'error' : 'success');
    notification.style.display = 'block';
    setTimeout(() => notification.style.display = 'none', 3000);
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebar-overlay').classList.remove('active');
}

// ==================== UPLOAD DE AVATAR ====================
async function uploadAvatar(file) {
    if (!file) return;
    
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        showNotification('Formato inválido! Use PNG, JPG, GIF ou WebP', true);
        return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
        showNotification('Imagem muito grande! Máximo 2MB', true);
        return;
    }
    
    try {
        showNotification('Enviando foto...');
        
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id}/avatar.${fileExt}`;
        
        const { error } = await supabase.storage
            .from('avatars')
            .upload(fileName, file, { cacheControl: '3600', upsert: true });
        
        if (error) throw error;
        
        const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);
        
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
            .eq('id', currentUser.id);
        
        if (updateError) throw updateError;
        
        currentUser.avatar_url = publicUrl;
        document.getElementById('profile-avatar-img').src = publicUrl;
        
        const headerAvatar = document.getElementById('profile-btn');
        if (headerAvatar) {
            headerAvatar.innerHTML = `<img src="${publicUrl}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        }
        
        showNotification('Foto atualizada com sucesso!');
        await loadAllUsers();
        renderLists();
        
    } catch (error) {
        console.error('Erro ao fazer upload:', error);
        showNotification('Erro ao enviar foto: ' + error.message, true);
    }
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
        
        await loadUserProfile();
        await loadAllUsers();
        await loadUserLists();
        updateProfileDisplay();
        
        // Iniciar sincronização em tempo real
        setupRealtimeSync();
        
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
            currentUser.avatar_url = data.avatar_url || null;
        } else {
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
        const { error } = await supabase
            .from('profiles')
            .insert([{
                id: currentUser.id,
                email: currentUser.email,
                name: currentUser.email.split('@')[0],
                username: '@' + currentUser.email.split('@')[0],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        currentUser.name = currentUser.email.split('@')[0];
        currentUser.username = '@' + currentUser.email.split('@')[0];
        
        console.log('✅ Perfil criado');
    } catch (error) {
        console.error('❌ Erro ao criar perfil:', error);
    }
}

function updateProfileDisplay() {
    const profileBtn = document.getElementById('profile-btn');
    const profileAvatar = document.getElementById('profile-avatar-img');
    const profileEmail = document.getElementById('profile-email');
    
    if (profileBtn) {
        if (currentUser.avatar_url) {
            profileBtn.innerHTML = `<img src="${currentUser.avatar_url}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
            const initial = currentUser.name ? currentUser.name[0].toUpperCase() : 'U';
            profileBtn.textContent = initial;
        }
    }
    
    if (profileAvatar) {
        if (currentUser.avatar_url) {
            profileAvatar.src = currentUser.avatar_url;
        } else {
            profileAvatar.src = 'https://via.placeholder.com/120/667eea/ffffff?text=' + (currentUser.name ? currentUser.name[0].toUpperCase() : '?');
        }
    }
    
    if (profileEmail) {
        profileEmail.textContent = currentUser.email;
    }
}

async function logout() {
    // Desconectar Realtime
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
    }
    
    await supabase.auth.signOut();
    window.location.href = 'index.html';
}

// ==================== USUÁRIOS ====================
async function loadAllUsers() {
    try {
        console.log('👥 Carregando usuários...');
        
        const { data, error } = await supabase
            .from('profiles')
            .select('id, name, username, email, avatar_url')
            .order('name');
        
        if (error) throw error;
        
        allUsers = (data || []).filter(u => u.id !== currentUser.id);
        console.log(`✅ ${allUsers.length} usuários carregados`);
        
    } catch (error) {
        console.error('❌ Erro ao carregar usuários:', error);
        allUsers = [];
    }
}

// ==================== REALTIME SYNC ====================
function setupRealtimeSync() {
    console.log('🔄 Configurando sincronização em tempo real...');
    
    // Criar canal para shopping_lists
    realtimeChannel = supabase.channel('db-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'shopping_lists'
            },
            (payload) => {
                console.log('🔔 Mudança detectada:', payload);
                handleRealtimeUpdate(payload);
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ Realtime: Conectado');
                showNotification('Sincronização em tempo real ativada');
            }
        });
}

async function handleRealtimeUpdate(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    // Verificar se a mudança é relevante para o usuário
    const isRelevant = newRecord && (
        newRecord.owner_id === currentUser.id ||
        (newRecord.shared_with && newRecord.shared_with.includes(currentUser.id))
    );
    
    if (!isRelevant && eventType !== 'DELETE') return;
    
    switch (eventType) {
        case 'INSERT':
            console.log('➕ Nova lista criada');
            await loadUserLists();
            showNotification('Nova lista adicionada!');
            break;
            
        case 'UPDATE':
            console.log('📝 Lista atualizada');
            
            // Atualizar lista local
            const listIndex = lists.findIndex(l => l.id === newRecord.id);
            if (listIndex >= 0) {
                lists[listIndex] = newRecord;
            }
            
            // Se for a lista atual, recarregar conteúdo
            if (currentList && currentList.id === newRecord.id) {
                currentList = newRecord;
                renderListContent();
                showNotification('Lista atualizada em tempo real!');
            }
            
            renderLists();
            break;
            
        case 'DELETE':
            console.log('🗑️ Lista removida');
            
            // Remover da lista local
            lists = lists.filter(l => l.id !== oldRecord.id);
            
            // Se for a lista atual, limpar
            if (currentList && currentList.id === oldRecord.id) {
                currentList = null;
                renderListContent();
                document.getElementById('list-actions').style.display = 'none';
                document.getElementById('current-list-title').textContent = 'Selecione uma lista';
                showNotification('Lista foi removida');
            }
            
            renderLists();
            break;
    }
}

// ==================== LISTAS ====================
async function loadUserLists() {
    try {
        console.log('📋 Carregando listas...');
        
        const { data, error } = await supabase
            .from('shopping_lists')
            .select('*')
            .or(`owner_id.eq.${currentUser.id},shared_with.cs.{${currentUser.id}}`)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        lists = data || [];
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
            <div class="empty-state">
                <i class="fas fa-clipboard-list"></i>
                <p>Nenhuma lista criada ainda</p>
                <p>Crie sua primeira lista!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = lists.map(list => {
        const isOwner = list.owner_id === currentUser.id;
        const isActive = currentList && currentList.id === list.id;
        const completedItems = list.items ? list.items.filter(item => item.completed).length : 0;
        const totalItems = list.items ? list.items.length : 0;
        
        const sharedUsers = (list.shared_with || [])
            .map(userId => allUsers.find(u => u.id === userId))
            .filter(u => u);
        
        const owner = isOwner ? null : allUsers.find(u => u.id === list.owner_id);
        
        return `
            <div class="list-item ${isActive ? 'active' : ''}" data-list-id="${list.id}">
                <h3>${list.name}</h3>
                <p>${list.description || 'Sem descrição'}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span style="font-size: 12px;">
                        <i class="fas fa-check-circle"></i> ${completedItems}/${totalItems}
                    </span>
                </div>
                
                ${isOwner && sharedUsers.length > 0 ? `
                    <div class="list-shared-avatars">
                        <span class="list-role-badge owner"><i class="fas fa-crown"></i> Dono</span>
                        <span class="list-shared-label">Com:</span>
                        ${sharedUsers.map(user => {
                            if (user.avatar_url) {
                                return `<img src="${user.avatar_url}" class="list-avatar-small" title="${user.name}">`;
                            } else {
                                return `<div class="list-avatar-initial" title="${user.name}">${user.name[0].toUpperCase()}</div>`;
                            }
                        }).join('')}
                    </div>
                ` : ''}
                
                ${!isOwner && owner ? `
                    <div class="list-shared-avatars">
                        <span class="list-role-badge guest"><i class="fas fa-user"></i> Convidado</span>
                        <span class="list-shared-label">Dono:</span>
                        ${owner.avatar_url ? 
                            `<img src="${owner.avatar_url}" class="list-avatar-small" title="${owner.name}">` : 
                            `<div class="list-avatar-initial" title="${owner.name}">${owner.name[0].toUpperCase()}</div>`
                        }
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.list-item').forEach(item => {
        item.addEventListener('click', () => {
            const listId = item.getAttribute('data-list-id');
            selectList(listId);
        });
    });
}

async function selectList(listId) {
    try {
        const list = lists.find(l => l.id === listId);
        if (!list) return;
        
        currentList = list;
        closeSidebar();
        
        document.getElementById('current-list-title').textContent = list.name;
        document.getElementById('list-actions').style.display = 'flex';
        
        const isOwner = list.owner_id === currentUser.id;
        document.getElementById('delete-list-btn').style.display = isOwner ? 'flex' : 'none';
        document.getElementById('share-list-btn').style.display = isOwner ? 'flex' : 'none';
        
        renderListContent();
        
    } catch (error) {
        console.error('❌ Erro ao selecionar lista:', error);
    }
}

async function saveList(list, isNew = false) {
    try {
        let sharedWithArray = [];
        
        if (list.shared_with && Array.isArray(list.shared_with)) {
            sharedWithArray = list.shared_with
                .map(id => typeof id === 'string' ? id : String(id))
                .filter(id => id && id.trim() !== '');
        }
        
        if (isNew) {
            const { data, error } = await supabase
                .from('shopping_lists')
                .insert([{
                    name: list.name,
                    description: list.description || '',
                    items: list.items || [],
                    owner_id: currentUser.id,
                    shared_with: sharedWithArray,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }])
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
                    shared_with: sharedWithArray,
                    updated_at: new Date().toISOString()
                })
                .eq('id', list.id)
                .select()
                .single();
            
            if (error) throw error;
            
            // Não precisa atualizar manualmente - o Realtime vai fazer isso
            // Mas mantenha para responsividade local
            const listIndex = lists.findIndex(l => l.id === data.id);
            if (listIndex >= 0) {
                lists[listIndex] = data;
            }
            
            if (currentList && currentList.id === data.id) {
                currentList = data;
            }
            
            return data;
        }
    } catch (error) {
        console.error('❌ Erro ao salvar lista:', error);
        showNotification(`Erro ao salvar lista: ${error.message}`, true);
        return null;
    }
}

async function deleteList(listId) {
    if (!confirm('Tem certeza que deseja excluir esta lista?')) return;
    
    try {
        const { error } = await supabase
            .from('shopping_lists')
            .delete()
            .eq('id', listId)
            .eq('owner_id', currentUser.id);
        
        if (error) throw error;
        
        // Realtime vai atualizar automaticamente
        
    } catch (error) {
        console.error('❌ Erro ao excluir lista:', error);
        showNotification('Erro ao excluir lista', true);
    }
}

// ==================== RENDERIZAR CONTEÚDO ====================
function renderListContent() {
    const container = document.getElementById('list-content');
    
    if (!currentList) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-basket fa-3x" style="color: #ccc;"></i>
                <h3>Nenhuma lista selecionada</h3>
                <p>Selecione ou crie uma lista para começar</p>
            </div>
        `;
        return;
    }
    
    const isOwner = currentList.owner_id === currentUser.id;
    const items = currentList.items || [];
    const completedItems = items.filter(item => item.completed).length;
    const totalItems = items.length;
    const totalValue = items.reduce((sum, item) => {
        if (item.price && !isNaN(parseFloat(item.price))) {
            const quantity = item.quantity && !isNaN(parseFloat(item.quantity)) ? parseFloat(item.quantity) : 1;
            return sum + (parseFloat(item.price) * quantity);
        }
        return sum;
    }, 0);
    
    const pendingValue = items.reduce((sum, item) => {
        if (!item.completed && item.price && !isNaN(parseFloat(item.price))) {
            const quantity = item.quantity && !isNaN(parseFloat(item.quantity)) ? parseFloat(item.quantity) : 1;
            return sum + (parseFloat(item.price) * quantity);
        }
        return sum;
    }, 0);
    
    let sharingInfoHTML = '';
    if (currentList.shared_with && currentList.shared_with.length > 0) {
        const sharedUsers = currentList.shared_with
            .map(userId => allUsers.find(u => u.id === userId))
            .filter(u => u);
        
        if (isOwner && sharedUsers.length > 0) {
            const names = sharedUsers.map(u => u.name).join(', ');
            sharingInfoHTML = `
                <div class="sharing-info">
                    <i class="fas fa-users"></i>
                    Dividindo com: ${names}
                </div>
            `;
        }
    }
    
    if (!isOwner) {
        const owner = allUsers.find(u => u.id === currentList.owner_id);
        if (owner) {
            sharingInfoHTML = `
                <div class="sharing-info">
                    <i class="fas fa-user-friends"></i>
                    Dividindo com: ${owner.name}
                </div>
            `;
        }
    }
    
    container.innerHTML = `
        ${sharingInfoHTML}
        
        <div class="stats-bar">
            <div class="stat-item">
                <div class="stat-label">Itens Totais</div>
                <div class="stat-value">${totalItems}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Concluídos</div>
                <div class="stat-value">${completedItems}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Valor Total</div>
                <div class="stat-value money">R$ ${totalValue.toFixed(2)}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">A Gastar</div>
                <div class="stat-value money">R$ ${pendingValue.toFixed(2)}</div>
            </div>
        </div>
        
        <div class="add-item-section">
            <h3 style="margin-bottom: 15px;">Adicionar Item</h3>
            <div class="add-item-grid">
                <div class="input-wrapper">
                    <label for="item-name">Nome do Item</label>
                    <input type="text" id="item-name" placeholder="Ex: Arroz, Leite...">
                </div>
                <div class="input-wrapper">
                    <label for="item-quantity">Quantidade</label>
                    <input type="number" id="item-quantity" placeholder="1" value="1" min="1">
                </div>
                <div class="input-wrapper">
                    <label for="item-unit">Unidade</label>
                    <select id="item-unit">
                        <option value="un">un</option>
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                        <option value="L">L</option>
                        <option value="ml">ml</option>
                        <option value="cx">cx</option>
                        <option value="pct">pct</option>
                        <option value="dz">dz</option>
                    </select>
                </div>
                <button id="add-item-btn" class="btn btn-success">
                    <i class="fas fa-plus"></i> Adicionar
                </button>
            </div>
        </div>
        
        <div class="items-list">
            <h3 style="margin-bottom: 15px;">Itens da Lista (${items.length})</h3>
            ${items.length === 0 ? `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-shopping-basket fa-2x" style="margin-bottom: 15px;"></i>
                    <p>Nenhum item na lista. Adicione itens acima!</p>
                </div>
            ` : items.map((item, index) => `
                <div class="item" data-index="${index}">
                    <div class="item-checkbox">
                        <input type="checkbox" ${item.completed ? 'checked' : ''} id="item-${index}">
                    </div>
                    <div class="item-content">
                        <div class="item-header">
                            <span class="item-text ${item.completed ? 'completed' : ''}">${item.name}</span>
                            <span class="item-quantity ${item.completed ? 'completed' : ''}">${item.quantity || 1} ${item.unit || 'un'}</span>
                        </div>
                        <div class="item-price-section">
                            ${isOwner || item.price ? `
                                ${item.price ? `
                                    <span class="item-price-display">
                                        R$ ${(parseFloat(item.price) * (item.quantity || 1)).toFixed(2)}
                                    </span>
                                ` : ''}
                                ${isOwner ? `
                                    <input type="text" class="item-price-input" 
                                        placeholder="R$ 0,00" 
                                        value="${item.price || ''}"
                                        data-index="${index}">
                                ` : ''}
                            ` : ''}
                        </div>
                    </div>
                    <div class="item-actions">
                        ${isOwner ? `
                            <button class="item-btn edit-item" data-index="${index}" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="item-btn delete-item" data-index="${index}" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.getElementById('add-item-btn').addEventListener('click', addItemToList);
    
    items.forEach((_, index) => {
        const checkbox = document.getElementById(`item-${index}`);
        if (checkbox) {
            checkbox.addEventListener('change', () => toggleItemComplete(index));
        }
    });
    
    document.querySelectorAll('.item-price-input').forEach(input => {
        input.addEventListener('change', (e) => updateItemPrice(e.target.dataset.index, e.target.value));
    });
    
    if (isOwner) {
        document.querySelectorAll('.edit-item').forEach(btn => {
            btn.addEventListener('click', (e) => editItem(e.target.closest('.edit-item').dataset.index));
        });
        
        document.querySelectorAll('.delete-item').forEach(btn => {
            btn.addEventListener('click', (e) => deleteItem(e.target.closest('.delete-item').dataset.index));
        });
    }
}

// ==================== ITENS ====================
async function addItemToList() {
    try {
        const nameInput = document.getElementById('item-name');
        const quantityInput = document.getElementById('item-quantity');
        const unitSelect = document.getElementById('item-unit');
        
        const name = nameInput.value.trim();
        const quantity = quantityInput.value.trim() || '1';
        const unit = unitSelect.value;
        
        if (!name) {
            showNotification('Digite o nome do item', true);
            nameInput.focus();
            return;
        }
        
        const newItem = {
            name: name,
            quantity: quantity,
            unit: unit,
            completed: false,
            price: '',
            added_by: currentUser.id,
            added_at: new Date().toISOString()
        };
        
        currentList.items = currentList.items || [];
        currentList.items.push(newItem);
        
        await saveList(currentList, false);
        
        nameInput.value = '';
        quantityInput.value = '1';
        unitSelect.value = 'un';
        nameInput.focus();
        
    } catch (error) {
        console.error('❌ Erro ao adicionar item:', error);
        showNotification('Erro ao adicionar item', true);
    }
}

async function toggleItemComplete(index) {
    try {
        if (!currentList || !currentList.items || index >= currentList.items.length) return;
        
        currentList.items[index].completed = !currentList.items[index].completed;
        await saveList(currentList, false);
        
    } catch (error) {
        console.error('❌ Erro ao atualizar item:', error);
    }
}

async function updateItemPrice(index, price) {
    try {
        if (!currentList || !currentList.items || index >= currentList.items.length) return;
        
        let formattedPrice = price.replace(/[^\d.,]/g, '').replace(',', '.');
        
        if (formattedPrice && !isNaN(parseFloat(formattedPrice))) {
            currentList.items[index].price = parseFloat(formattedPrice).toFixed(2);
        } else {
            currentList.items[index].price = '';
        }
        
        await saveList(currentList, false);
        
    } catch (error) {
        console.error('❌ Erro ao atualizar preço:', error);
    }
}

async function editItem(index) {
    try {
        if (!currentList || !currentList.items || index >= currentList.items.length) return;
        
        const item = currentList.items[index];
        const newName = prompt('Editar nome do item:', item.name);
        
        if (newName && newName.trim() !== '') {
            const newQuantity = prompt('Editar quantidade:', item.quantity || '1');
            const newUnit = prompt('Editar unidade (un, kg, g, L, ml, cx, pct, dz):', item.unit || 'un');
            
            if (newQuantity && !isNaN(parseFloat(newQuantity)) && parseFloat(newQuantity) > 0) {
                currentList.items[index].name = newName.trim();
                currentList.items[index].quantity = newQuantity;
                currentList.items[index].unit = newUnit || 'un';
                await saveList(currentList, false);
            }
        }
        
    } catch (error) {
        console.error('❌ Erro ao editar item:', error);
    }
}

async function deleteItem(index) {
    try {
        if (!currentList || !currentList.items || index >= currentList.items.length) return;
        
        if (confirm('Tem certeza que deseja remover este item?')) {
            currentList.items.splice(index, 1);
            await saveList(currentList, false);
        }
        
    } catch (error) {
        console.error('❌ Erro ao excluir item:', error);
    }
}

// ==================== COMPARTILHAMENTO ====================
async function openShareModal() {
    if (!currentList) return;
    
    await renderSharedUsers();
    document.getElementById('user-search').value = '';
    document.getElementById('search-results').innerHTML = '';
    openModal('share-modal');
}

async function renderSharedUsers() {
    const sharedUsersList = document.getElementById('shared-users-list');
    const sharedUsersSection = document.getElementById('shared-users-section');
    
    if (!currentList.shared_with || currentList.shared_with.length === 0) {
        sharedUsersSection.style.display = 'none';
        sharedUsersList.innerHTML = '';
        return;
    }
    
    const { data: sharedUsers, error } = await supabase
        .from('profiles')
        .select('id, name, username, email, avatar_url')
        .in('id', currentList.shared_with);
    
    if (error) {
        sharedUsersSection.style.display = 'none';
        return;
    }
    
    sharedUsersSection.style.display = 'block';
    sharedUsersList.innerHTML = sharedUsers.map(user => `
        <div class="shared-user-item" data-user-id="${user.id}">
            <div class="shared-user-info">
                <div class="shared-user-avatar">
                    ${user.avatar_url ? `<img src="${user.avatar_url}" alt="${user.name}">` : user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                    <strong>${user.name || 'Sem nome'}</strong>
                    <p style="font-size: 12px; color: #666;">${user.email}</p>
                </div>
            </div>
            <button class="btn btn-outline btn-small remove-share-btn" data-user-id="${user.id}">
                <i class="fas fa-times"></i> Remover
            </button>
        </div>
    `).join('');
    
    document.querySelectorAll('.remove-share-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await removeUserFromList(btn.getAttribute('data-user-id'));
        });
    });
}

async function searchUsers() {
    const searchTerm = document.getElementById('user-search').value.trim().toLowerCase();
    const searchResults = document.getElementById('search-results');
    const searchLoading = document.getElementById('search-loading');
    
    if (!searchTerm) {
        searchResults.innerHTML = '';
        return;
    }
    
    searchLoading.style.display = 'block';
    
    const filteredUsers = allUsers.filter(user => {
        const searchFields = [
            user.name?.toLowerCase() || '',
            user.username?.toLowerCase() || '',
            user.email?.toLowerCase() || ''
        ];
        return searchFields.some(field => field.includes(searchTerm));
    });
    
    const sharedUserIds = currentList.shared_with || [];
    const availableUsers = filteredUsers.filter(user => !sharedUserIds.includes(user.id));
    
    searchLoading.style.display = 'none';
    
    if (availableUsers.length === 0) {
        searchResults.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;"><i class="fas fa-search"></i><p>Nenhum usuário encontrado</p></div>';
        return;
    }
    
    searchResults.innerHTML = availableUsers.map(user => `
        <div class="user-result" data-user-id="${user.id}">
            <div class="user-info">
                <div class="user-avatar">
                    ${user.avatar_url ? `<img src="${user.avatar_url}" alt="${user.name}">` : user.name.charAt(0).toUpperCase()}
                </div>
                <div class="user-details">
                    <h4>${user.name || 'Sem nome'}</h4>
                    <p>${user.username || ''} • ${user.email}</p>
                </div>
            </div>
            <button class="btn btn-primary btn-small add-share-btn" data-user-id="${user.id}">
                <i class="fas fa-plus"></i> Adicionar
            </button>
        </div>
    `).join('');
    
    document.querySelectorAll('.add-share-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await addUserToList(btn.getAttribute('data-user-id'));
        });
    });
}

async function addUserToList(userId) {
    if (!currentList) return;
    
    currentList.shared_with = currentList.shared_with || [];
    
    if (currentList.shared_with.includes(userId)) {
        showNotification('Usuário já está na lista de compartilhamento', true);
        return;
    }
    
    currentList.shared_with.push(userId);
    await saveList(currentList, false);
    await renderSharedUsers();
    
    document.getElementById('user-search').value = '';
    document.getElementById('search-results').innerHTML = '';
    
    showNotification('Usuário adicionado à lista de compartilhamento');
}

async function removeUserFromList(userId) {
    if (!currentList || !currentList.shared_with) return;
    
    currentList.shared_with = currentList.shared_with.filter(id => id !== userId);
    await saveList(currentList, false);
    await renderSharedUsers();
    
    showNotification('Usuário removido da lista de compartilhamento');
}

// ==================== PERFIL ====================
async function openProfileModal() {
    document.getElementById('profile-name').value = currentUser.name || '';
    document.getElementById('profile-username').value = currentUser.username || '';
    openModal('profile-modal');
}

async function saveProfile() {
    try {
        const profileName = document.getElementById('profile-name').value.trim();
        const profileUsername = document.getElementById('profile-username').value.trim();
        
        if (!profileName || !profileUsername) {
            showNotification('Preencha todos os campos', true);
            return;
        }
        
        const { error } = await supabase
            .from('profiles')
            .upsert({
                id: currentUser.id,
                email: currentUser.email,
                name: profileName,
                username: profileUsername,
                updated_at: new Date().toISOString()
            });
        
        if (error) throw error;
        
        currentUser.name = profileName;
        currentUser.username = profileUsername;
        
        closeModal('profile-modal');
        showNotification('Perfil atualizado com sucesso!');
        updateProfileDisplay();
        
        await loadAllUsers();
        renderLists();
        
    } catch (error) {
        console.error('❌ Erro ao salvar perfil:', error);
        showNotification('Erro ao salvar perfil: ' + error.message, true);
    }
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    checkAuth();
    
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    
    document.getElementById('menu-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('active');
        document.getElementById('sidebar-overlay').classList.add('active');
    });
    
    document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
    
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('profile-btn').addEventListener('click', openProfileModal);
    
    document.getElementById('profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveProfile();
    });
    
    document.getElementById('new-list-btn').addEventListener('click', () => {
        document.getElementById('list-name').value = '';
        document.getElementById('list-description').value = '';
        openModal('create-list-modal');
    });
    
    document.getElementById('create-list-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('list-name').value.trim();
        const description = document.getElementById('list-description').value.trim();
        
        if (!name) {
            showNotification('Digite o nome da lista', true);
            return;
        }
        
        const newList = { name, description, items: [] };
        const savedList = await saveList(newList, true);
        
        if (savedList) {
            lists.unshift(savedList);
            closeModal('create-list-modal');
            selectList(savedList.id);
        }
    });
    
    document.getElementById('share-list-btn').addEventListener('click', openShareModal);
    
    document.getElementById('delete-list-btn').addEventListener('click', () => {
        if (currentList) deleteList(currentList.id);
    });
    
    let searchTimeout;
    document.getElementById('user-search').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(searchUsers, 300);
    });
});

console.log('✅ Anota Aí carregado - v6.0 (PWA + Realtime)');
