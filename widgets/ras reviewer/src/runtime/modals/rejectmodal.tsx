import React, { useState } from 'react'
import { Button, Modal, ModalHeader, ModalBody, ModalFooter } from 'reactstrap'
// import 'bootstrap/dist/css/bootstrap.min.css'
import '../app.css'

const RejectModal = ({ isOpen, toggle, rejectWorkflow }) => {
//   const [modal, setModal] = useState(false)

  return (
    <div>
      <Modal isOpen={isOpen} toggle={toggle} zIndex="1001" id="acceptModal">
        <ModalHeader className='modalHeader'>Reject Data</ModalHeader>
        <ModalBody isOpen={isOpen}>
        Are you sure you want to Reject this data from going into the database? This change cannot be undone.
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onClick={rejectWorkflow}>
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

export default RejectModal


