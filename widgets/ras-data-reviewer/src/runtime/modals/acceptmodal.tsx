
import React, { useState } from 'react';
import { Button, Modal, ModalHeader, ModalBody, ModalFooter } from 'jimu-ui';
import '../app.css'

const AcceptModal = ({ isOpen, toggle, acceptWorkflow }) => {
  return (
    <div>
      <Modal isOpen={isOpen} toggle={toggle} zIndex="1001" id="acceptModal" className='reviewerModals'>
        <ModalHeader className='modalHeader'>Accept Data</ModalHeader>
        <ModalBody isOpen={isOpen} className='modalBody'>
        Are you sure you want to Accept this data?
        </ModalBody>
        <ModalFooter>
          <Button type="primary" onClick={acceptWorkflow}>
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

export default AcceptModal
