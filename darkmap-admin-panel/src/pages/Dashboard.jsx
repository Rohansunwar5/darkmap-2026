import { useState } from 'react';
import MainLayout from '../components/layout/MainLayout';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import api from '../services/api';
import toast from 'react-hot-toast';

const Dashboard = () => {
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [actionType, setActionType] = useState(null);

    const executeAction = async () => {
        setLoading(true);
        setModalOpen(false);
        const toastId = toast.loading('Processing...');

        try {
            let endpoint = '';
            let successMsg = '';

            switch (actionType) {
                case 'create':
                    endpoint = '/ecs/create';
                    successMsg = 'Infrastructure Created Successfully';
                    break;
                case 'start':
                    endpoint = '/ecs/start-services';
                    successMsg = 'Services Started Successfully';
                    break;
                case 'delete':
                    endpoint = '/ecs/delete';
                    successMsg = 'Infrastructure Deleted Successfully';
                    break;
                case 'create-2':
                    endpoint = '/ecs/create-2';
                    successMsg = 'Infrastructure 2 Created Successfully';
                    break;
                case 'delete-2':
                    endpoint = '/ecs/delete-2';
                    successMsg = 'Infrastructure 2 Deleted Successfully';
                    break;
            }

            await api.post(endpoint);
            toast.success(successMsg, { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || 'Action Failed', { id: toastId });
        } finally {
            setLoading(false);
            setActionType(null);
        }
    };

    const confirmAction = (type) => {
        setActionType(type);
        setModalOpen(true);
    };

    const getModalContent = () => {
        switch (actionType) {
            case 'create':
                return { title: 'Create Infrastructure', body: 'This will create the ECS infrastructure.', confirm: 'Create', variant: 'primary' };
            case 'start':
                return { title: 'Start Services', body: 'This will start all ECS services.', confirm: 'Start', variant: 'primary' };
            case 'delete':
                return { title: 'Delete Infrastructure', body: 'Warning: This will delete all ECS infrastructure. This action cannot be undone.', confirm: 'Delete', variant: 'danger' };
            case 'create-2':
                return { title: 'Create Infrastructure 2', body: 'This will create the secondary ECS infrastructure.', confirm: 'Create', variant: 'primary' };
            case 'delete-2':
                return { title: 'Delete Infrastructure 2', body: 'Warning: This will delete the secondary ECS infrastructure. This action cannot be undone.', confirm: 'Delete', variant: 'danger' };
            default:
                return { title: '', body: '', confirm: '', variant: 'default' };
        }
    };

    const modalData = getModalContent();

    return (
        <MainLayout>
            <div className="p-6 max-w-4xl mx-auto">
                <h1 className="text-2xl font-bold text-white mb-8 border-b border-gray-700 pb-4">ECS Control Panel</h1>

                <div className="space-y-6">
                    {/* Create Section */}
                    <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-blue-400">Create Infrastructure</h3>
                            {/* <p className="text-gray-400 text-sm mt-1">POST /ecs/create</p> */}
                            <p className="text-gray-500 text-xs mt-1">Provisions new ECS clusters and definitions.</p>
                        </div>
                        <Button onClick={() => confirmAction('create')} disabled={loading}>
                            Create ECS
                        </Button>
                    </div>

                    {/* Start Section */}
                    <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-green-400">Start Services</h3>
                            {/* <p className="text-gray-400 text-sm mt-1">POST /ecs/start-services</p> */}
                            <p className="text-gray-500 text-xs mt-1">Boots all defined services on the cluster.</p>
                        </div>
                        <Button variant="secondary" onClick={() => confirmAction('start')} disabled={loading}>
                            Start Services
                        </Button>
                    </div>

                    {/* Delete Section */}
                    <div className="bg-gray-900 p-6 rounded-lg border border-red-900/30 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-red-500">Delete Infrastructure</h3>
                            {/* <p className="text-gray-400 text-sm mt-1">POST /ecs/delete</p> */}
                            <p className="text-gray-500 text-xs mt-1">Terminates all tasks and deletes the cluster.</p>
                        </div>
                        <Button variant="danger" onClick={() => confirmAction('delete')} disabled={loading}>
                            Delete ECS
                        </Button>
                    </div>

                    {/* Create 2 Section */}
                    <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-blue-400">Create Infrastructure 2</h3>
                            <p className="text-gray-500 text-xs mt-1">Provisions secondary ECS clusters and definitions.</p>
                        </div>
                        <Button onClick={() => confirmAction('create-2')} disabled={loading}>
                            Create ECS 2
                        </Button>
                    </div>

                    {/* Delete 2 Section */}
                    <div className="bg-gray-900 p-6 rounded-lg border border-red-900/30 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-red-500">Delete Infrastructure 2</h3>
                            <p className="text-gray-500 text-xs mt-1">Terminates secondary tasks and deletes the cluster.</p>
                        </div>
                        <Button variant="danger" onClick={() => confirmAction('delete-2')} disabled={loading}>
                            Delete ECS 2
                        </Button>
                    </div>
                </div>

                <Modal
                    isOpen={modalOpen}
                    onClose={() => setModalOpen(false)}
                    onConfirm={executeAction}
                    title={modalData.title}
                    confirmText={modalData.confirm}
                    variant={modalData.variant}
                >
                    {modalData.body}
                </Modal>
            </div>
        </MainLayout>
    );
};

export default Dashboard;
