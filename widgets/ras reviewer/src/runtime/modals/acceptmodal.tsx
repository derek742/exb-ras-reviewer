import React, { useState } from 'react'
import { Button, Modal, ModalHeader, ModalBody, ModalFooter } from 'reactstrap'
// import 'bootstrap/dist/css/bootstrap.min.css'
import '../app.css'

const AcceptModal = ({ isOpen, toggle, acceptWorkflow }) => {
//   const [modal, setModal] = useState(false)

  return (
    <div>
      <Modal isOpen={isOpen} toggle={toggle} zIndex="1001" id="acceptModal">
        <ModalHeader className='modalHeader'>Accept Data</ModalHeader>
        <ModalBody isOpen={isOpen}>
        Are you sure you want to Accept this data into the database? This change cannot be undone.
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onClick={acceptWorkflow}>
           Yes
          </Button>{' '}
          <Button color="secondary" onClick={toggle}>
            No
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}

export default AcceptModal
