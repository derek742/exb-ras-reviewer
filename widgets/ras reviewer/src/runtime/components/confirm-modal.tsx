import React from 'react'
import './confirm-modal.css'

type ConfirmModalProps = {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal(props: ConfirmModalProps) {
  const { isOpen, title, message, onConfirm, onCancel } = props

  if (!isOpen) {
    return null
  }

  return (
    <div className='confirm-modal-overlay'>
      <div className='confirm-modal-card'>
        <h4>{title}</h4>
        <p>{message}</p>
        <div className='confirm-modal-buttons'>
          <button className='review-button' onClick={onConfirm}>Confirm</button>
          <button className='review-button secondary' onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
