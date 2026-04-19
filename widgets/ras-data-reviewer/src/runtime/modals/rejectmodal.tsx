import React from 'react'
import { Button, Modal, ModalHeader, ModalBody, ModalFooter } from 'jimu-ui';
import '../app.css'

const RejectModal = ({ isOpen, toggle, rejectWorkflow }) => {
  return (
    <div>
      <Modal isOpen={isOpen} toggle={toggle} zIndex="1001" id="acceptModal" className='reviewerModals'>
        <ModalHeader className='modalHeader'>Reject Data</ModalHeader>
        <ModalBody isOpen={isOpen}>
        Are you sure you want to Reject this data?.
        </ModalBody>
        <ModalFooter>
          <Button type="primary" onClick={rejectWorkflow}>
           Yes
          </Button>{' '}
          <Button type="secondary" onClick={toggle}>
            No
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}

export default RejectModal


